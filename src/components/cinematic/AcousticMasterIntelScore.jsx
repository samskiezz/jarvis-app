/**
 * F690 — Acoustic Master Intelligence Score (ACMSCORE)
 * Computes a 0-100 composite intelligence score per acoustic contact by
 * cross-referencing /v1/acoustic/contacts against:
 *   • /entities/RiskSignal   (+35 pts if ≥1 risk keyword-matches)
 *   • /entities/IntelProfile (+35 pts if ≥1 profile keyword-matches)
 *   • /v1/investigations      (+30 pts if ≥1 case keyword-matches)
 * HIGH_VALUE ≥ 60 | PARTIAL 20–59 | BACKGROUND < 20
 * Filter tabs: ALL / HIGH_VALUE / PARTIAL / BACKGROUND + search.
 * Click-to-expand breakdown bars + matched entity names.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat brief + TTS.
 * Event: jarvis:acmscore-toggle | 90-s auto-refresh.
 */
import React, { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 144_080;
const Z_INDEX  = 226;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ACMSCORE_RE = /\b(acmscore|acoustic\s+(master|intel)\s+score|acoustic\s+intelligence\s+score|master\s+intel\s+score|contact\s+score|acoustic\s+ranked|sensor\s+score|acoustic\s+intel\s+rank|composite\s+(acoustic|sensor)\s+score)\b/i;

// ── normalise helpers ─────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function hasOverlap(aStr, bStr) {
  const setA = new Set(keywords(aStr));
  return keywords(bStr).some(w => setA.has(w));
}

// ── scoring ───────────────────────────────────────────────────────────────────

function scoreContact(c, risks, profiles, cases) {
  const tags = [c.name, c.callsign, c.id, c.type, c.classification, c.description]
    .filter(Boolean).join(" ");

  const matchedRisks = risks.filter(r =>
    hasOverlap(tags, [r.title, r.name, r.description, r.source].filter(Boolean).join(" "))
  );
  const matchedProfiles = profiles.filter(p =>
    hasOverlap(tags, [p.name, p.aliases, p.description, p.actor_type].filter(Boolean).join(" "))
  );
  const matchedCases = cases.filter(inv =>
    hasOverlap(tags, [inv.title, inv.summary, inv.description, inv.lead].filter(Boolean).join(" "))
  );

  const riskPts    = matchedRisks.length    > 0 ? 35 : 0;
  const profilePts = matchedProfiles.length > 0 ? 35 : 0;
  const casePts    = matchedCases.length    > 0 ? 30 : 0;
  const score      = riskPts + profilePts + casePts;

  return {
    ...c,
    _score: score,
    _riskPts: riskPts,
    _profilePts: profilePts,
    _casePts: casePts,
    _matchedRisks: matchedRisks,
    _matchedProfiles: matchedProfiles,
    _matchedCases: matchedCases,
    _tier: score >= 60 ? "HIGH_VALUE" : score >= 20 ? "PARTIAL" : "BACKGROUND",
  };
}

// ── JarvisBrain exports ───────────────────────────────────────────────────────

export function isAcmscoreQuery(text) {
  return ACMSCORE_RE.test(text || "");
}

export async function buildAcmscoreScript() {
  const base    = apiBase();
  const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  try {
    const [cr, rr, pr, ir] = await Promise.all([
      fetch(`${base}/v1/acoustic/contacts`,  { headers }).then(r => r.json()),
      fetch(`${base}/entities/RiskSignal`,   { headers }).then(r => r.json()),
      fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/investigations`,     { headers }).then(r => r.json()),
    ]);
    const contacts  = norm(cr, ["contacts","items","data"]);
    const risks     = norm(rr, ["items","data","results"]);
    const profiles  = norm(pr, ["items","data","results"]);
    const cases     = norm(ir, ["items","data","results","investigations"]);
    const scored    = contacts.map(c => scoreContact(c, risks, profiles, cases));
    const highValue = scored.filter(c => c._tier === "HIGH_VALUE");
    const topNames  = highValue.slice(0, 3).map(c => c.name || c.callsign || c.id).join(", ");
    const summary   = `Acoustic Master Intel Score: ${contacts.length} contacts scored. HIGH_VALUE: ${highValue.length}${topNames ? " ("+topNames+")" : ""}. PARTIAL: ${scored.filter(c=>c._tier==="PARTIAL").length}. BACKGROUND: ${scored.filter(c=>c._tier==="BACKGROUND").length}.`;
    window.dispatchEvent(new CustomEvent("jarvis:acmscore-toggle"));
    const r2 = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ message: `${summary} Provide a 2-sentence operational threat assessment.` }),
    });
    const j2 = await r2.json();
    return j2?.response || j2?.message || j2?.answer || summary;
  } catch (e) {
    return `Acoustic Master Intel Score error: ${e.message}`;
  }
}

// ── sub-components ────────────────────────────────────────────────────────────

const TIER_COLOURS = {
  HIGH_VALUE:  "#ff4444",
  PARTIAL:     "#ffaa00",
  BACKGROUND:  "#44aaff",
};

function ScoreBar({ pts, max, colour, label }) {
  const pct = max > 0 ? Math.round((pts / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#aaa", marginBottom: 2 }}>
        <span>{label}</span><span>{pts}/{max}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 3, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colour, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function TierBadge({ tier }) {
  const col = TIER_COLOURS[tier] || "#aaa";
  return (
    <span style={{ background: col + "22", border: `1px solid ${col}`, color: col, borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
      {tier}
    </span>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AcousticMasterIntelScore() {
  const [open,      setOpen]      = useState(false);
  const [scored,    setScored]    = useState([]);
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
      const [cr, rr, pr, ir] = await Promise.all([
        fetch(`${base}/v1/acoustic/contacts`,  { headers }).then(r => r.json()),
        fetch(`${base}/entities/RiskSignal`,   { headers }).then(r => r.json()),
        fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()),
        fetch(`${base}/v1/investigations`,     { headers }).then(r => r.json()),
      ]);
      const contacts = norm(cr, ["contacts","items","data"]);
      const risks    = norm(rr, ["items","data","results"]);
      const profiles = norm(pr, ["items","data","results"]);
      const cases    = norm(ir, ["items","data","results","investigations"]);
      const s = contacts
        .map(c => scoreContact(c, risks, profiles, cases))
        .sort((a, b) => b._score - a._score);
      setScored(s);
    } catch (_) { /* stale data stays */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:acmscore-toggle", toggle);
    return () => window.removeEventListener("jarvis:acmscore-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  const highValue  = scored.filter(c => c._tier === "HIGH_VALUE");
  const partial    = scored.filter(c => c._tier === "PARTIAL");
  const background = scored.filter(c => c._tier === "BACKGROUND");

  const visible = (
    tab === "HIGH_VALUE"  ? highValue  :
    tab === "PARTIAL"     ? partial    :
    tab === "BACKGROUND"  ? background : scored
  ).filter(c => !search || [c.name, c.callsign, c.id, c.type].some(f =>
    String(f || "").toLowerCase().includes(search.toLowerCase())
  ));

  const assess = async () => {
    setAssessing(true); setBrief("");
    try {
      const base    = apiBase();
      const headers = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const summary = `Acoustic Master Intel Score: ${scored.length} contacts. HIGH_VALUE: ${highValue.length}, PARTIAL: ${partial.length}, BACKGROUND: ${background.length}. Top targets: ${highValue.slice(0,3).map(c=>c.name||c.callsign||c.id).join(", ")||"none"}.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers,
        body: JSON.stringify({ message: `${summary} Provide a 2-sentence operational threat assessment.` }),
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

  const TABS = ["ALL", "HIGH_VALUE", "PARTIAL", "BACKGROUND"];

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Acoustic Master Intelligence Score (ACMSCORE)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: highValue.length > 0 ? "rgba(255,68,68,0.18)" : "rgba(0,30,60,0.82)",
          border: `1px solid ${highValue.length > 0 ? "#ff4444" : "#00ffe7"}`,
          color: highValue.length > 0 ? "#ff4444" : "#00ffe7",
          borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer",
          fontFamily: "monospace", letterSpacing: 1,
        }}
      >
        ◈ ACMSCORE{highValue.length > 0 ? ` [${highValue.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, width: 560, maxHeight: "84vh",
      background: "rgba(0,10,25,0.97)", border: "1px solid #00ffe7",
      borderRadius: 10, zIndex: Z_INDEX + 100, display: "flex", flexDirection: "column",
      boxShadow: "0 0 40px rgba(0,255,231,0.12)", fontFamily: "monospace",
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid rgba(0,255,231,0.15)" }}>
        <span style={{ color: "#00ffe7", fontWeight: 700, fontSize: 13, flex: 1 }}>
          ◈ ACOUSTIC MASTER INTEL SCORE
        </span>
        {loading && <span style={{ color: "#888", fontSize: 10, marginRight: 10 }}>⟳</span>}
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "10px 14px" }}>
        {[
          { label: "CONTACTS",   val: scored.length,      col: "#00ffe7" },
          { label: "HIGH VALUE", val: highValue.length,   col: "#ff4444" },
          { label: "PARTIAL",    val: partial.length,     col: "#ffaa00" },
          { label: "BACKGROUND", val: background.length,  col: "#44aaff" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#888", fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* search + tabs */}
      <div style={{ padding: "0 14px 8px" }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search contacts..."
          style={{ width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(0,255,231,0.2)", color: "#e0f7fa", borderRadius: 5, padding: "5px 10px", fontSize: 11, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? "rgba(0,255,231,0.15)" : "transparent",
              border: `1px solid ${tab === t ? "#00ffe7" : "rgba(0,255,231,0.2)"}`,
              color: tab === t ? "#00ffe7" : "#888", borderRadius: 4, padding: "3px 8px",
              fontSize: 10, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1,
            }}>{t}{t !== "ALL" ? ` (${(t==="HIGH_VALUE"?highValue:t==="PARTIAL"?partial:background).length})` : ""}</button>
          ))}
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {visible.length === 0 && (
          <div style={{ color: "#555", textAlign: "center", padding: 20, fontSize: 12 }}>no contacts</div>
        )}
        {visible.map((c, i) => {
          const key  = c.id || c.callsign || i;
          const name = c.name || c.callsign || c.id || "unknown";
          const col  = TIER_COLOURS[c._tier] || "#aaa";
          const isEx = expanded === key;
          return (
            <div key={key}
              onClick={() => setExpanded(isEx ? null : key)}
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid rgba(0,255,231,0.1)`, borderRadius: 6, padding: "8px 10px", marginBottom: 6, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 700, minWidth: 38, textAlign: "right" }}>{c._score}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: "#e0f7fa", fontSize: 12, fontWeight: 600 }}>{name}</div>
                  <div style={{ color: "#888", fontSize: 10 }}>{c.type || c.classification || "acoustic contact"}</div>
                </div>
                <TierBadge tier={c._tier} />
                <span style={{ color: "#555", fontSize: 12 }}>{isEx ? "▲" : "▼"}</span>
              </div>

              {isEx && (
                <div style={{ marginTop: 10 }}>
                  <ScoreBar pts={c._riskPts}    max={35} colour="#ff4444" label="Risk Signal match" />
                  <ScoreBar pts={c._profilePts} max={35} colour="#aa44ff" label="Intel Profile match" />
                  <ScoreBar pts={c._casePts}    max={30} colour="#ffaa00" label="Investigation match" />

                  {c._matchedRisks.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: "#ff4444", fontSize: 10, marginBottom: 3 }}>RISK SIGNALS</div>
                      {c._matchedRisks.slice(0, 3).map((r, ri) => (
                        <div key={ri} style={{ color: "#ccc", fontSize: 10, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {r.title || r.name || r.id}
                          <span style={{ color: "#ff4444", marginLeft: 6, fontSize: 9 }}>{r.severity || r.level || ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c._matchedProfiles.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: "#aa44ff", fontSize: 10, marginBottom: 3 }}>INTEL PROFILES</div>
                      {c._matchedProfiles.slice(0, 3).map((p, pi) => (
                        <div key={pi} style={{ color: "#ccc", fontSize: 10, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {p.name || p.id}
                          <span style={{ color: "#aa44ff", marginLeft: 6, fontSize: 9 }}>{p.threat_level || p.actor_type || ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {c._matchedCases.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: "#ffaa00", fontSize: 10, marginBottom: 3 }}>INVESTIGATIONS</div>
                      {c._matchedCases.slice(0, 3).map((inv, ii) => (
                        <div key={ii} style={{ color: "#ccc", fontSize: 10, padding: "2px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                          {inv.title || inv.id}
                          <span style={{ color: "#ffaa00", marginLeft: 6, fontSize: 9 }}>{inv.status || ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(0,255,231,0.1)" }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{ background: "rgba(0,255,231,0.12)", border: "1px solid #00ffe7", color: "#00ffe7", borderRadius: 5, padding: "5px 14px", fontSize: 11, cursor: assessing ? "wait" : "pointer", fontFamily: "monospace" }}
        >
          {assessing ? "⟳ ASSESSING..." : "▶ ASSESS"}
        </button>
        {brief && (
          <div style={{ color: "#b0d8e0", fontSize: 11, marginTop: 8, lineHeight: 1.5, padding: "6px 10px", background: "rgba(0,255,231,0.05)", borderRadius: 5, border: "1px solid rgba(0,255,231,0.1)" }}>
            {brief}
          </div>
        )}
      </div>
    </div>
  );
}
