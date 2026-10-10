/**
 * F133 — Risk Signal × Knowledge × Ops Event × IntelProfile
 *         Comprehensive Threat Evidence Matrix (RKOITHEM)
 *
 * Parallel-fetches:
 *   /entities/RiskSignal    → active risk signals
 *   /knowledge/             → knowledge-base articles
 *   /v1/ops/events          → operational events
 *   /entities/IntelProfile  → known threat actor profiles
 *
 * Keyword-correlates each risk signal (title/description/severity/tags)
 * against KB articles AND ops events AND intel profiles to classify:
 *   FULLY_EVIDENCED  — matched all three sources
 *   DUAL_EVIDENCED   — matched any two sources
 *   SINGLE_EVIDENCED — matched exactly one source
 *   UNEVIDENCED      — no corroborating evidence (intelligence gap)
 *
 * Red pulse badge on unevidenced count.
 * ▶ ASSESS EVIDENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:rkoithem-toggle event.
 * Voice: "rkoithem / threat evidence / risk evidence /
 *         evidenced risk / unevidenced risk / comprehensive threat evidence".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_017_400;
const Z_INDEX  = 195;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const RKOITHEM_RE =
  /\b(rkoithem|threat[\s-]evidence|risk[\s-]evidence|evidenced[\s-]risk|unevidenced[\s-]risk|comprehensive[\s-]threat[\s-]evidence)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const OR     = "#F97316";
const RE     = "#EF4444";
const BL     = "#3B82F6";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isRkoithemQuery(text) {
  return RKOITHEM_RE.test(text || "");
}

export async function buildRkoithemScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [signals, kb, ops, profiles] = await Promise.all([
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/knowledge/`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/ops/events`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/IntelProfile`, { headers }).then(r => r.json()).catch(() => []),
  ]);
  const sigArr  = Array.isArray(signals) ? signals : (signals?.items || signals?.data || []);
  const kbArr   = Array.isArray(kb)      ? kb      : (kb?.items      || kb?.data      || []);
  const opsArr  = Array.isArray(ops)     ? ops     : (ops?.items     || ops?.data     || []);
  const profArr = Array.isArray(profiles)? profiles: (profiles?.items|| profiles?.data|| []);

  const unevidenced = sigArr.filter(s => {
    const txt = `${s.title||""} ${s.description||""} ${s.severity||""} ${(s.tags||[]).join(" ")}`.toLowerCase();
    const words = txt.split(/\W+/).filter(w => w.length > 3);
    const hitKb  = kbArr.some(a => words.some(w => `${a.title||""} ${a.content||""}`.toLowerCase().includes(w)));
    const hitOps = opsArr.some(e => words.some(w => `${e.title||""} ${e.description||""}`.toLowerCase().includes(w)));
    const hitPrf = profArr.some(p => words.some(w => `${p.name||""} ${p.aliases||""} ${p.org||""}`.toLowerCase().includes(w)));
    return !hitKb && !hitOps && !hitPrf;
  }).length;
  const total = sigArr.length;

  const context = `Risk signals: ${total}. Unevidenced (no KB/ops/actor corroboration): ${unevidenced}. KB articles: ${kbArr.length}. Ops events: ${opsArr.length}. Intel profiles: ${profArr.length}.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: `RKOITHEM Threat Evidence Matrix. ${context} In exactly 2 sentences, identify the biggest intelligence gap and the recommended next action.` }),
  });
  const j = await r.json();
  return j?.response || j?.message || "Threat evidence matrix assessed, sir.";
}

// ── helpers ───────────────────────────────────────────────────────────────────
function tokens(str) {
  return (str || "").toLowerCase().split(/\W+/).filter(w => w.length > 3);
}

function matchScore(sigTokens, text) {
  const t = (text || "").toLowerCase();
  const hits = sigTokens.filter(w => t.includes(w));
  return hits.length;
}

function classify(sig, kbArr, opsArr, profArr) {
  const txt = `${sig.title||""} ${sig.description||""} ${sig.severity||""} ${(sig.tags||[]).join(" ")}`;
  const toks = tokens(txt);
  const hitKb  = kbArr.some(a  => matchScore(toks, `${a.title||""} ${a.content||""} ${a.summary||""}`) > 0);
  const hitOps = opsArr.some(e => matchScore(toks, `${e.title||""} ${e.description||""}`) > 0);
  const hitPrf = profArr.some(p => matchScore(toks, `${p.name||""} ${(p.aliases||[]).join(" ")} ${p.org||""} ${p.role||""}`) > 0);
  const count = [hitKb, hitOps, hitPrf].filter(Boolean).length;
  if (count === 3) return "FULLY_EVIDENCED";
  if (count === 2) return "DUAL_EVIDENCED";
  if (count === 1) return "SINGLE_EVIDENCED";
  return "UNEVIDENCED";
}

function matchedItems(toks, arr, fields) {
  return arr
    .map(item => {
      const t = fields.map(f => item[f] || "").join(" ");
      const score = matchScore(toks, t);
      return { item, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(x => x.item);
}

const SEV_COLOUR = { critical: RE, high: OR, medium: AM, low: GR };

// ── component ─────────────────────────────────────────────────────────────────
export default function RiskSignalEvidenceMatrix() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [kb,        setKb]        = useState([]);
  const [ops,       setOps]       = useState([]);
  const [profiles,  setProfiles]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [s, k, o, p] = await Promise.all([
        fetch(`${base}/entities/RiskSignal`,  { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/knowledge/`,           { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`,        { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/IntelProfile`,{ headers: h }).then(r => r.json()).catch(() => []),
      ]);
      setSignals( Array.isArray(s) ? s : (s?.items || s?.data || []));
      setKb(      Array.isArray(k) ? k : (k?.items || k?.data || []));
      setOps(     Array.isArray(o) ? o : (o?.items || o?.data || []));
      setProfiles(Array.isArray(p) ? p : (p?.items || p?.data || []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:rkoithem-toggle", handler);
    return () => window.removeEventListener("jarvis:rkoithem-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const classified = signals.map(sig => ({
    sig,
    cls: classify(sig, kb, ops, profiles),
  }));

  const counts = {
    FULLY_EVIDENCED:  classified.filter(x => x.cls === "FULLY_EVIDENCED").length,
    DUAL_EVIDENCED:   classified.filter(x => x.cls === "DUAL_EVIDENCED").length,
    SINGLE_EVIDENCED: classified.filter(x => x.cls === "SINGLE_EVIDENCED").length,
    UNEVIDENCED:      classified.filter(x => x.cls === "UNEVIDENCED").length,
  };
  const evidencePct = signals.length
    ? Math.round(((counts.FULLY_EVIDENCED + counts.DUAL_EVIDENCED + counts.SINGLE_EVIDENCED) / signals.length) * 100)
    : 0;

  const visible = classified.filter(({ sig, cls }) => {
    if (filter !== "ALL" && cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return `${sig.title||""} ${sig.description||""} ${sig.severity||""}`.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildRkoithemScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text: script } }));
    } catch {
      setBrief("Assessment unavailable. Ensure backend is reachable.");
    } finally {
      setAssessing(false);
    }
  };

  const CLS_COLOUR = {
    FULLY_EVIDENCED:  GR,
    DUAL_EVIDENCED:   CY,
    SINGLE_EVIDENCED: AM,
    UNEVIDENCED:      RE,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, color: CY,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${BORDER}`,
          padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          whiteSpace: "nowrap",
        }}
      >
        ◈ RKOITHEM
        {counts.UNEVIDENCED > 0 && (
          <span style={{
            marginLeft: 5, background: RE, color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
            animation: "pulse 1.5s infinite",
          }}>{counts.UNEVIDENCED}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX + 10,
      width: 660, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
      fontFamily: FONT, color: CY, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11, letterSpacing: 1 }}>
          ◈ RKOITHEM — THREAT EVIDENCE MATRIX
          {loading && <span style={{ color: AM, marginLeft: 8, fontSize: 10 }}>⟳</span>}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          { label: "RISK SIGS",       val: signals.length,          col: CY },
          { label: "KB ARTICLES",     val: kb.length,               col: GR },
          { label: "OPS EVENTS",      val: ops.length,              col: BL },
          { label: "INTEL PROFILES",  val: profiles.length,         col: OR },
          { label: "FULLY EVID.",     val: counts.FULLY_EVIDENCED,  col: GR },
          { label: "DUAL EVID.",      val: counts.DUAL_EVIDENCED,   col: CY },
          { label: "SINGLE EVID.",    val: counts.SINGLE_EVIDENCED, col: AM },
          { label: "UNEVIDENCED",     val: counts.UNEVIDENCED,      col: RE },
          { label: "EVIDENCE%",       val: `${evidencePct}%`,       col: evidencePct > 60 ? GR : AM },
        ].map(t => (
          <div key={t.label} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
            borderRadius: 4, padding: "4px 8px", textAlign: "center", minWidth: 72,
          }}>
            <div style={{ fontSize: 9, color: DIM }}>{t.label}</div>
            <div style={{ fontSize: 13, color: t.col, fontWeight: 700 }}>{t.val}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ padding: "0 14px 6px" }}>
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${evidencePct}%`, background: evidencePct > 60 ? GR : AM, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 6px", flexWrap: "wrap", alignItems: "center" }}>
        {["ALL","FULLY_EVIDENCED","DUAL_EVIDENCED","SINGLE_EVIDENCED","UNEVIDENCED"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? CY : "rgba(0,0,0,0.4)",
            border: `1px solid ${BORDER}`, borderRadius: 3, padding: "2px 7px",
            color: filter === f ? "#000" : DIM, fontSize: 9, cursor: "pointer",
          }}>{f.replace(/_/g," ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search signals…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${BORDER}`,
            borderRadius: 3, padding: "3px 8px", color: CY, fontSize: 10,
            fontFamily: FONT, outline: "none", width: 140,
          }}
        />
      </div>

      {/* signal list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
        {visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: "20px 0", textAlign: "center" }}>
            {loading ? "Loading…" : "No signals match the current filter."}
          </div>
        )}
        {visible.map(({ sig, cls }) => {
          const id = sig.id || sig._id || sig.title;
          const isExp = expanded === id;
          const toks = tokens(`${sig.title||""} ${sig.description||""} ${sig.severity||""} ${(sig.tags||[]).join(" ")}`);
          const matchedKb   = matchedItems(toks, kb,       ["title","content","summary"]);
          const matchedOps  = matchedItems(toks, ops,      ["title","description"]);
          const matchedProf = matchedItems(toks, profiles, ["name","aliases","org","role"]);
          const sev = (sig.severity || "").toLowerCase();

          return (
            <div key={id} style={{ marginBottom: 5, borderRadius: 4, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  background: cls === "UNEVIDENCED" ? "rgba(239,68,68,0.06)" : "rgba(0,0,0,0.3)",
                }}
              >
                <span style={{ fontSize: 10, color: SEV_COLOUR[sev] || DIM, minWidth: 52 }}>
                  {(sig.severity || "UNKNOWN").toUpperCase()}
                </span>
                <span style={{ flex: 1, fontSize: 11, color: "#cce8ff" }}>{sig.title || id}</span>
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 3,
                  background: CLS_COLOUR[cls] + "22", border: `1px solid ${CLS_COLOUR[cls]}55`,
                  color: CLS_COLOUR[cls],
                }}>{cls.replace(/_/g," ")}</span>
                <span style={{ color: DIM, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* KB matches */}
                  {matchedKb.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: GR, marginBottom: 3 }}>KB ARTICLES ({matchedKb.length})</div>
                      {matchedKb.map((a, i) => {
                        const score = matchScore(toks, `${a.title||""} ${a.content||""} ${a.summary||""}`);
                        const pct = Math.min(100, score * 15);
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#cce8ff" }}>{a.title || a.id}</div>
                            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: GR }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Ops event matches */}
                  {matchedOps.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: BL, marginBottom: 3 }}>OPS EVENTS ({matchedOps.length})</div>
                      {matchedOps.map((e, i) => {
                        const score = matchScore(toks, `${e.title||""} ${e.description||""}`);
                        const pct = Math.min(100, score * 15);
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ fontSize: 10, color: "#cce8ff" }}>{e.title || e.id}</div>
                            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: BL }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {/* Intel profile matches */}
                  {matchedProf.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: OR, marginBottom: 3 }}>INTEL PROFILES ({matchedProf.length})</div>
                      {matchedProf.map((p, i) => {
                        const score = matchScore(toks, `${p.name||""} ${(p.aliases||[]).join(" ")} ${p.org||""} ${p.role||""}`);
                        const pct = Math.min(100, score * 15);
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10, color: "#cce8ff" }}>{p.name || p.id}</span>
                              {p.role && <span style={{ fontSize: 8, color: OR, border: `1px solid ${OR}55`, borderRadius: 2, padding: "0 4px" }}>{p.role}</span>}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: OR }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {matchedKb.length === 0 && matchedOps.length === 0 && matchedProf.length === 0 && (
                    <div style={{ color: RE, fontSize: 10 }}>No corroborating evidence found for this risk signal.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess button + brief */}
      <div style={{ padding: "6px 14px 10px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(0,0,0,0.4)" : `${CY}22`,
            border: `1px solid ${CY}55`, borderRadius: 4, padding: "5px 14px",
            color: CY, fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
            fontFamily: FONT,
          }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS EVIDENCE"}
        </button>
        {brief && (
          <div style={{ marginTop: 6, fontSize: 10, color: "#cce8ff", lineHeight: 1.5, opacity: 0.9 }}>
            {brief}
          </div>
        )}
      </div>

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
