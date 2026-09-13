/**
 * F684 — Acoustic × Knowledge × Risk Triple Nexus (ACKRTRI)
 * Three-way cross-reference: /v1/acoustic/contacts × /knowledge/ × /entities/RiskSignal.
 * Each acoustic contact is classified:
 *   FULLY_COVERED  — matches ≥1 knowledge article AND ≥1 risk signal
 *   KNOWLEDGE_ONLY — knowledge article match but no risk signal
 *   RISK_ONLY      — risk signal match but no knowledge article
 *   DARK           — neither knowledge nor risk signal (intelligence blind spot)
 * Coverage % tile = FULLY_COVERED / total contacts.
 * Tabs: ALL / FULLY_COVERED / KNOWLEDGE_ONLY / RISK_ONLY / DARK + search.
 * Click-to-expand shows matched articles + matched signals per contact.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence triple coverage brief + TTS.
 * 90-second auto-refresh. Event: jarvis:ackrtri-toggle.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 138_920;
const Z_INDEX  = 220;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACKRTRI_RE = /\b(ackrtri|acoustic\s+knowledge\s+risk|acoustic\s+triple|knowledge\s+risk\s+acoustic|sensor\s+triple\s+coverage|acoustic\s+covered|acoustic\s+krtri|ackr\s+triple|acoustic\s+fully\s+covered|acoustic\s+coverage\s+triple)\b/i;

const SEV_COLOR = { CRITICAL: "#ff4444", HIGH: "#ff8800", MEDIUM: "#ffaa00", LOW: "#00e5a0", INFO: "#29E7FF" };

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
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.contacts))    return raw.contacts;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normaliseArticles(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.articles))    return raw.articles;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function normaliseSignals(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.signals))     return raw.signals;
  if (Array.isArray(raw?.risk_signals))return raw.risk_signals;
  if (Array.isArray(raw?.items))       return raw.items;
  if (Array.isArray(raw?.data))        return raw.data;
  return [];
}

function contactText(c) {
  return [c.name, c.callsign, c.id, c.type, c.classification, c.vessel_type, c.description]
    .filter(Boolean).join(" ");
}

function crossRef(contacts, articles, signals) {
  return contacts.map(c => {
    const ct = contactText(c);
    const matchedArticles = articles.filter(a => {
      const at = [a.title, a.content, a.summary, a.tags, a.kind].filter(Boolean).join(" ");
      return overlap(ct, at) > 0;
    }).map(a => ({
      ...a,
      hits: overlap(ct, [a.title, a.content, a.summary, a.tags].filter(Boolean).join(" ")),
    }));
    const matchedSignals = signals.filter(s => {
      const st = [s.title, s.name, s.description, s.source, s.entity].filter(Boolean).join(" ");
      return overlap(ct, st) > 0;
    }).map(s => ({
      ...s,
      hits: overlap(ct, [s.title, s.name, s.description, s.source].filter(Boolean).join(" ")),
    }));
    const hasKnowledge = matchedArticles.length > 0;
    const hasRisk      = matchedSignals.length > 0;
    const coverage     = hasKnowledge && hasRisk ? "FULLY_COVERED"
      : hasKnowledge ? "KNOWLEDGE_ONLY"
      : hasRisk      ? "RISK_ONLY"
      : "DARK";
    return { ...c, _articles: matchedArticles, _signals: matchedSignals, _coverage: coverage };
  });
}

// ── JarvisBrain exports ────────────────────────────────────────────────────────

export function isAckrtriQuery(text) {
  return ACKRTRI_RE.test(text || "");
}

export async function buildAckrtriScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, ar, sr] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
      fetch(`${base}/knowledge/`,           { headers }).then(r => r.json()),
      fetch(`${base}/entities/RiskSignal`,  { headers }).then(r => r.json()),
    ]);
    const contacts = normaliseContacts(cr);
    const articles = normaliseArticles(ar);
    const signals  = normaliseSignals(sr);
    const enriched = crossRef(contacts, articles, signals);
    const fully    = enriched.filter(c => c._coverage === "FULLY_COVERED");
    const dark     = enriched.filter(c => c._coverage === "DARK");
    const summary  = `${contacts.length} acoustic contacts cross-referenced with ${articles.length} knowledge articles and ${signals.length} risk signals. FULLY_COVERED: ${fully.length}, DARK: ${dark.length}.`;
    const rr = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `Acoustic × Knowledge × Risk Triple: ${summary} Top dark contacts: ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence triple coverage operational brief.` }),
    });
    const rj = await rr.json();
    return rj?.response || rj?.message || rj?.answer || summary;
  } catch (e) {
    return `Acoustic Knowledge Risk Triple error: ${e.message}`;
  }
}

// ── Coverage badge colors ─────────────────────────────────────────────────────

const COV_COLOR = {
  FULLY_COVERED:  { bg: "#00e5a022", border: "#00e5a055", text: "#00e5a0" },
  KNOWLEDGE_ONLY: { bg: "#29E7FF22", border: "#29E7FF55", text: "#29E7FF" },
  RISK_ONLY:      { bg: "#ff880022", border: "#ff880055", text: "#ff8800" },
  DARK:           { bg: "#ff444422", border: "#ff444455", text: "#ff4444" },
};

// ── main component ─────────────────────────────────────────────────────────────

export default function AcousticKnowledgeRiskTriple() {
  const [open,      setOpen]      = useState(false);
  const [contacts,  setContacts]  = useState([]);
  const [articles,  setArticles]  = useState([]);
  const [signals,   setSignals]   = useState([]);
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
      const [cr, ar, sr] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`, { headers }).then(r => r.json()),
        fetch(`${base}/knowledge/`,           { headers }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`,  { headers }).then(r => r.json()),
      ]);
      const c = normaliseContacts(cr);
      const a = normaliseArticles(ar);
      const s = normaliseSignals(sr);
      setContacts(c);
      setArticles(a);
      setSignals(s);
      setEnriched(crossRef(c, a, s));
    } catch (_) { /* stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ackrtri-toggle", toggle);
    return () => window.removeEventListener("jarvis:ackrtri-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const fully   = enriched.filter(c => c._coverage === "FULLY_COVERED");
  const knowOnly= enriched.filter(c => c._coverage === "KNOWLEDGE_ONLY");
  const riskOnly= enriched.filter(c => c._coverage === "RISK_ONLY");
  const dark    = enriched.filter(c => c._coverage === "DARK");
  const pct     = enriched.length > 0 ? Math.round(fully.length / enriched.length * 100) : 0;

  const tabMap  = {
    ALL:            enriched,
    FULLY_COVERED:  fully,
    KNOWLEDGE_ONLY: knowOnly,
    RISK_ONLY:      riskOnly,
    DARK:           dark,
  };
  const visible = (tabMap[tab] || enriched)
    .filter(c => !search || [c.name, c.callsign, c.id, c.type].some(f => String(f || "").toLowerCase().includes(search.toLowerCase())));

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `${contacts.length} acoustic contacts: FULLY_COVERED ${fully.length}, KNOWLEDGE_ONLY ${knowOnly.length}, RISK_ONLY ${riskOnly.length}, DARK ${dark.length}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `Acoustic × Knowledge × Risk Triple: ${summary} Dark contacts (no coverage): ${dark.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ") || "none"}. Provide a 2-sentence intelligence coverage assessment.` }),
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
        title="Acoustic × Knowledge × Risk Triple Nexus (ACKRTRI)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: dark.length > 0 ? "rgba(255,68,68,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${dark.length > 0 ? "#ff4444" : "#00ffe7"}`,
          color: dark.length > 0 ? "#ff4444" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACKRTRI{dark.length > 0 ? ` [${dark.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 560, maxHeight: "85vh",
      background: "rgba(0,8,20,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#c8f0ff", boxShadow: "0 0 40px #00ffe722",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid #00ffe733" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, letterSpacing: 2, fontSize: 12 }}>
          ◈ ACOUSTIC × KNOWLEDGE × RISK TRIPLE
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ color: "#ffaa00", fontSize: 11 }}>⟳</span>}
          <span style={{ color: "#888", fontSize: 10 }}>{contacts.length} contacts · {articles.length} articles · {signals.length} signals</span>
          <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#ff4444", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #00ffe711" }}>
        {[
          { label: "FULLY COVERED",  val: fully.length,    color: "#00e5a0" },
          { label: "KNOWLEDGE ONLY", val: knowOnly.length, color: "#29E7FF" },
          { label: "RISK ONLY",      val: riskOnly.length, color: "#ff8800" },
          { label: "DARK",           val: dark.length,     color: dark.length > 0 ? "#ff4444" : "#444" },
          { label: "COVERAGE %",     val: `${pct}%`,       color: pct >= 50 ? "#00e5a0" : "#ff8800" },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ flex: 1, background: "rgba(0,255,231,0.04)", border: "1px solid #00ffe711", borderRadius: 6, padding: "5px 6px", textAlign: "center" }}>
            <div style={{ color, fontSize: 15, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#556", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 14px 0", alignItems: "center", flexWrap: "wrap" }}>
        {["ALL", "FULLY_COVERED", "KNOWLEDGE_ONLY", "RISK_ONLY", "DARK"].map(t => {
          const ct = COV_COLOR[t] || { border: "#333", text: "#667", bg: "none" };
          const count = tabMap[t]?.length ?? enriched.length;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? (ct.bg || "#00ffe722") : "none",
              border: `1px solid ${tab === t ? (ct.border || "#00ffe7") : "#333"}`,
              color: tab === t ? (ct.text || "#00ffe7") : "#667",
              borderRadius: 4, padding: "2px 7px", fontSize: 9, cursor: "pointer",
              letterSpacing: 0.5,
            }}>
              {t.replace(/_/g, " ")} ({count})
            </button>
          );
        })}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search…"
          style={{ marginLeft: "auto", background: "rgba(0,255,231,0.06)", border: "1px solid #00ffe733", borderRadius: 4, padding: "2px 8px", color: "#c8f0ff", fontSize: 11, width: 100, outline: "none" }}
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
          const cc    = COV_COLOR[c._coverage] || COV_COLOR.DARK;
          return (
            <div key={id} style={{ marginBottom: 6, background: "rgba(0,255,231,0.03)", border: `1px solid ${cc.border}`, borderRadius: 6, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer" }}
              >
                <span style={{ flex: 1, fontSize: 12, color: "#c8f0ff" }}>{label}</span>
                {c.type && <span style={{ color: "#667", fontSize: 10 }}>{c.type}</span>}
                <span style={{ background: cc.bg, color: cc.text, border: `1px solid ${cc.border}`, borderRadius: 4, padding: "1px 7px", fontSize: 9, letterSpacing: 0.5 }}>
                  {c._coverage.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#00ffe744", fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ borderTop: "1px solid #00ffe711", padding: "8px 12px", background: "rgba(0,0,0,0.3)" }}>
                  {c.classification && <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Classification: {c.classification}</div>}
                  {c.description    && <div style={{ fontSize: 11, color: "#aaa", marginBottom: 6 }}>{c.description}</div>}

                  {/* Knowledge Articles */}
                  <div style={{ fontSize: 11, color: "#29E7FF", marginBottom: 4, fontWeight: 700 }}>
                    Knowledge Articles ({c._articles.length}):
                  </div>
                  {c._articles.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#555", marginBottom: 6 }}>No article match.</div>
                  ) : c._articles.slice(0, 3).map((a, ai) => (
                    <div key={a.id || ai} style={{ marginBottom: 4, padding: "3px 8px", background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 4, fontSize: 11 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {a.kind && <span style={{ background: "#29E7FF22", color: "#29E7FF", border: "1px solid #29E7FF55", borderRadius: 3, padding: "0 5px", fontSize: 9 }}>{a.kind}</span>}
                        <span style={{ color: "#b8e0ff", flex: 1 }}>{a.title || a.id}</span>
                        <span style={{ color: "#888", fontSize: 10 }}>hits: {a.hits}</span>
                      </div>
                    </div>
                  ))}
                  {c._articles.length > 3 && <div style={{ fontSize: 10, color: "#667", marginBottom: 4 }}>+{c._articles.length - 3} more…</div>}

                  {/* Risk Signals */}
                  <div style={{ fontSize: 11, color: "#ff8800", marginBottom: 4, fontWeight: 700, marginTop: 6 }}>
                    Risk Signals ({c._signals.length}):
                  </div>
                  {c._signals.length === 0 ? (
                    <div style={{ fontSize: 11, color: "#555" }}>No risk signal match.</div>
                  ) : c._signals.slice(0, 3).map((s, si) => (
                    <div key={s.id || si} style={{ marginBottom: 4, padding: "3px 8px", background: "rgba(255,136,0,0.06)", border: "1px solid #ff880033", borderRadius: 4, fontSize: 11 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {s.severity && <span style={{ background: `${SEV_COLOR[s.severity] || "#667"}22`, color: SEV_COLOR[s.severity] || "#667", border: `1px solid ${SEV_COLOR[s.severity] || "#667"}55`, borderRadius: 3, padding: "0 5px", fontSize: 9 }}>{s.severity}</span>}
                        <span style={{ color: "#ffa855", flex: 1 }}>{s.title || s.name || s.id}</span>
                        <span style={{ color: "#888", fontSize: 10 }}>hits: {s.hits}</span>
                      </div>
                    </div>
                  ))}
                  {c._signals.length > 3 && <div style={{ fontSize: 10, color: "#667" }}>+{c._signals.length - 3} more…</div>}
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
