/**
 * F134 — Investment × Report × Ops Event × RiskSignal
 *         Financial Risk Intelligence Dashboard (IRORFD)
 *
 * Parallel-fetches:
 *   /entities/Investment  → portfolio assets
 *   /v1/reports           → intelligence reports
 *   /v1/ops/events        → operational events
 *   /entities/RiskSignal  → active risk signals
 *
 * Keyword-correlates each investment (name/type/sector/description)
 * against intelligence reports AND ops events AND risk signals to classify:
 *   FULLY_TRACKED  — matched all three sources
 *   DUAL_TRACKED   — matched any two sources
 *   PARTIAL        — matched exactly one source
 *   UNTRACKED      — no intelligence coverage (blind spot)
 *
 * Amber badge on untracked count.
 * ▶ ASSESS RISK INTELLIGENCE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh.  jarvis:irorfd-toggle event.
 * Voice: "irorfd / investment risk intelligence / financial risk dashboard /
 *         untracked investments / investment intel dashboard /
 *         financial intelligence coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_017_960;
const Z_INDEX  = 196;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const IRORFD_RE =
  /\b(irorfd|investment[\s-]risk[\s-]intelligence|financial[\s-]risk[\s-]dashboard|untracked[\s-]investments?|investment[\s-]intel[\s-]dashboard|financial[\s-]intelligence[\s-]coverage)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const AM     = "#F59E0B";
const GR     = "#22C55E";
const OR     = "#F97316";
const RE     = "#EF4444";
const BL     = "#3B82F6";
const PU     = "#A855F7";
const GO     = "#EAB308";
const DIM    = "#6E8AA0";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isIrorfdQuery(text) {
  return IRORFD_RE.test(text || "");
}

export async function buildIrorfdScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [investments, reports, ops, signals] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/reports`,          { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/v1/ops/events`,       { headers }).then(r => r.json()).catch(() => []),
    fetch(`${base}/entities/RiskSignal`, { headers }).then(r => r.json()).catch(() => []),
  ]);
  const invArr = Array.isArray(investments) ? investments : (investments?.items || investments?.data || []);
  const repArr = Array.isArray(reports)     ? reports     : (reports?.items     || reports?.data     || []);
  const opsArr = Array.isArray(ops)         ? ops         : (ops?.items         || ops?.data         || []);
  const sigArr = Array.isArray(signals)     ? signals     : (signals?.items     || signals?.data     || []);

  const untracked = invArr.filter(inv => {
    const txt = `${inv.name||""} ${inv.type||""} ${inv.sector||""} ${inv.description||""}`.toLowerCase();
    const words = txt.split(/\W+/).filter(w => w.length > 3);
    const hitRep = repArr.some(r => words.some(w => `${r.title||""} ${r.description||""} ${(r.tags||[]).join(" ")}`.toLowerCase().includes(w)));
    const hitOps = opsArr.some(e => words.some(w => `${e.title||""} ${e.description||""}`.toLowerCase().includes(w)));
    const hitSig = sigArr.some(s => words.some(w => `${s.title||""} ${s.description||""}`.toLowerCase().includes(w)));
    return !hitRep && !hitOps && !hitSig;
  }).length;
  const total = invArr.length;

  const context = `Investments: ${total}. Untracked (no report/ops/risk coverage): ${untracked}. Reports: ${repArr.length}. Ops events: ${opsArr.length}. Risk signals: ${sigArr.length}.`;
  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: `IRORFD Financial Risk Intelligence Dashboard. ${context} In exactly 2 sentences, identify the highest-risk intelligence gap in the portfolio and recommend the next action.` }),
  });
  const j = await r.json();
  return j?.response || j?.message || "Financial risk intelligence dashboard assessed, sir.";
}

// ── helpers ───────────────────────────────────────────────────────────────────
function tokens(str) {
  return (str || "").toLowerCase().split(/\W+/).filter(w => w.length > 3);
}

function matchScore(invTokens, text) {
  const t = (text || "").toLowerCase();
  return invTokens.filter(w => t.includes(w)).length;
}

function classify(inv, repArr, opsArr, sigArr) {
  const txt = `${inv.name||""} ${inv.type||""} ${inv.sector||""} ${inv.description||""}`;
  const toks = tokens(txt);
  const hitRep = repArr.some(r => matchScore(toks, `${r.title||""} ${r.description||""} ${(r.tags||[]).join(" ")}`) > 0);
  const hitOps = opsArr.some(e => matchScore(toks, `${e.title||""} ${e.description||""}`) > 0);
  const hitSig = sigArr.some(s => matchScore(toks, `${s.title||""} ${s.description||""} ${s.severity||""}`) > 0);
  const count = [hitRep, hitOps, hitSig].filter(Boolean).length;
  if (count === 3) return "FULLY_TRACKED";
  if (count === 2) return "DUAL_TRACKED";
  if (count === 1) return "PARTIAL";
  return "UNTRACKED";
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
export default function InvestmentRiskIntelDashboard() {
  const [open,        setOpen]        = useState(false);
  const [investments, setInvestments] = useState([]);
  const [reports,     setReports]     = useState([]);
  const [ops,         setOps]         = useState([]);
  const [signals,     setSignals]     = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [filter,      setFilter]      = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [expanded,    setExpanded]    = useState(null);
  const [assessing,   setAssessing]   = useState(false);
  const [brief,       setBrief]       = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const h = { Authorization: `Bearer ${API_KEY}` };
    try {
      const [inv, rep, o, sig] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/reports`,          { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/v1/ops/events`,       { headers: h }).then(r => r.json()).catch(() => []),
        fetch(`${base}/entities/RiskSignal`, { headers: h }).then(r => r.json()).catch(() => []),
      ]);
      setInvestments(Array.isArray(inv) ? inv : (inv?.items || inv?.data || []));
      setReports(    Array.isArray(rep) ? rep : (rep?.items || rep?.data || []));
      setOps(        Array.isArray(o)   ? o   : (o?.items   || o?.data   || []));
      setSignals(    Array.isArray(sig) ? sig : (sig?.items || sig?.data || []));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:irorfd-toggle", handler);
    return () => window.removeEventListener("jarvis:irorfd-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const classified = investments.map(inv => ({
    inv,
    cls: classify(inv, reports, ops, signals),
  }));

  const counts = {
    FULLY_TRACKED: classified.filter(x => x.cls === "FULLY_TRACKED").length,
    DUAL_TRACKED:  classified.filter(x => x.cls === "DUAL_TRACKED").length,
    PARTIAL:       classified.filter(x => x.cls === "PARTIAL").length,
    UNTRACKED:     classified.filter(x => x.cls === "UNTRACKED").length,
  };
  const coveragePct = investments.length
    ? Math.round(((counts.FULLY_TRACKED + counts.DUAL_TRACKED + counts.PARTIAL) / investments.length) * 100)
    : 0;

  const visible = classified.filter(({ inv, cls }) => {
    if (filter !== "ALL" && cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return `${inv.name||""} ${inv.type||""} ${inv.sector||""}`.toLowerCase().includes(q);
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const script = await buildIrorfdScript();
      setBrief(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak", { detail: { text: script } }));
    } catch {
      setBrief("Assessment unavailable. Ensure backend is reachable.");
    } finally {
      setAssessing(false);
    }
  };

  const CLS_COLOUR = {
    FULLY_TRACKED: GR,
    DUAL_TRACKED:  CY,
    PARTIAL:       AM,
    UNTRACKED:     RE,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, color: GO,
          background: "rgba(6,11,22,0.82)", border: `1px solid rgba(234,179,8,0.25)`,
          padding: "3px 8px", cursor: "pointer", borderRadius: 3,
          whiteSpace: "nowrap",
        }}
      >
        ◈ IRORFD
        {counts.UNTRACKED > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
            animation: "pulse 1.5s infinite",
          }}>{counts.UNTRACKED}</span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 20, zIndex: Z_INDEX + 10,
      width: 680, maxHeight: "80vh", display: "flex", flexDirection: "column",
      background: BG, border: `1px solid rgba(234,179,8,0.25)`, borderRadius: 8,
      fontFamily: FONT, color: GO, overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: `1px solid rgba(234,179,8,0.18)`, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ flex: 1, fontSize: 11, letterSpacing: 1, color: GO }}>
          ◈ IRORFD — FINANCIAL RISK INTELLIGENCE DASHBOARD
          {loading && <span style={{ color: AM, marginLeft: 8, fontSize: 10 }}>⟳</span>}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", flexWrap: "wrap" }}>
        {[
          { label: "INVESTMENTS",   val: investments.length,   col: GO },
          { label: "REPORTS",       val: reports.length,       col: PU },
          { label: "OPS EVENTS",    val: ops.length,           col: BL },
          { label: "RISK SIGS",     val: signals.length,       col: RE },
          { label: "FULLY TRACKED", val: counts.FULLY_TRACKED, col: GR },
          { label: "DUAL TRACKED",  val: counts.DUAL_TRACKED,  col: CY },
          { label: "PARTIAL",       val: counts.PARTIAL,       col: AM },
          { label: "UNTRACKED",     val: counts.UNTRACKED,     col: RE },
          { label: "COVERAGE%",     val: `${coveragePct}%`,    col: coveragePct > 60 ? GR : AM },
        ].map(t => (
          <div key={t.label} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid rgba(234,179,8,0.15)`,
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
          <div style={{ height: "100%", width: `${coveragePct}%`, background: coveragePct > 60 ? GR : AM, transition: "width 0.4s" }} />
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "0 14px 6px", flexWrap: "wrap", alignItems: "center" }}>
        {["ALL","FULLY_TRACKED","DUAL_TRACKED","PARTIAL","UNTRACKED"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? GO : "rgba(0,0,0,0.4)",
            border: `1px solid rgba(234,179,8,0.25)`, borderRadius: 3, padding: "2px 7px",
            color: filter === f ? "#000" : DIM, fontSize: 9, cursor: "pointer",
          }}>{f.replace(/_/g," ")}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
          style={{
            marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid rgba(234,179,8,0.2)`,
            borderRadius: 3, padding: "3px 8px", color: GO, fontSize: 10,
            fontFamily: FONT, outline: "none", width: 150,
          }}
        />
      </div>

      {/* investment list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
        {visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 11, padding: "20px 0", textAlign: "center" }}>
            {loading ? "Loading…" : "No investments match the current filter."}
          </div>
        )}
        {visible.map(({ inv, cls }) => {
          const id = inv.id || inv._id || inv.name;
          const isExp = expanded === id;
          const toks = tokens(`${inv.name||""} ${inv.type||""} ${inv.sector||""} ${inv.description||""}`);
          const matchedRep = matchedItems(toks, reports, ["title","description","tags"]);
          const matchedOps = matchedItems(toks, ops,     ["title","description"]);
          const matchedSig = matchedItems(toks, signals, ["title","description","severity"]);

          return (
            <div key={id} style={{ marginBottom: 5, borderRadius: 4, border: `1px solid rgba(234,179,8,0.15)`, overflow: "hidden" }}>
              <div
                onClick={() => setExpanded(isExp ? null : id)}
                style={{
                  padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                  background: cls === "UNTRACKED" ? "rgba(239,68,68,0.06)" : "rgba(0,0,0,0.3)",
                }}
              >
                {inv.type && (
                  <span style={{ fontSize: 9, color: GO, border: `1px solid rgba(234,179,8,0.35)`, borderRadius: 2, padding: "0 5px", minWidth: 44, textAlign: "center" }}>
                    {(inv.type || "").toUpperCase().slice(0, 8)}
                  </span>
                )}
                <span style={{ flex: 1, fontSize: 11, color: "#cce8ff" }}>{inv.name || id}</span>
                {inv.sector && (
                  <span style={{ fontSize: 9, color: DIM }}>{inv.sector}</span>
                )}
                <span style={{
                  fontSize: 9, padding: "1px 6px", borderRadius: 3,
                  background: CLS_COLOUR[cls] + "22", border: `1px solid ${CLS_COLOUR[cls]}55`,
                  color: CLS_COLOUR[cls],
                }}>{cls.replace(/_/g," ")}</span>
                <span style={{ color: DIM, fontSize: 11 }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 10px 10px", background: "rgba(0,0,0,0.2)" }}>
                  {/* Report matches */}
                  {matchedRep.length > 0 && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 9, color: PU, marginBottom: 3 }}>INTELLIGENCE REPORTS ({matchedRep.length})</div>
                      {matchedRep.map((r, i) => {
                        const score = matchScore(toks, `${r.title||""} ${r.description||""} ${(r.tags||[]).join(" ")}`);
                        const pct = Math.min(100, score * 15);
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10, color: "#cce8ff" }}>{r.title || r.id}</span>
                              {r.type && <span style={{ fontSize: 8, color: PU, border: `1px solid ${PU}55`, borderRadius: 2, padding: "0 4px" }}>{r.type}</span>}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: PU }} />
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
                  {/* Risk signal matches */}
                  {matchedSig.length > 0 && (
                    <div>
                      <div style={{ fontSize: 9, color: RE, marginBottom: 3 }}>RISK SIGNALS ({matchedSig.length})</div>
                      {matchedSig.map((s, i) => {
                        const score = matchScore(toks, `${s.title||""} ${s.description||""} ${s.severity||""}`);
                        const pct = Math.min(100, score * 15);
                        const sev = (s.severity || "").toLowerCase();
                        return (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10, color: "#cce8ff" }}>{s.title || s.id}</span>
                              {s.severity && <span style={{ fontSize: 8, color: SEV_COLOUR[sev] || DIM, border: `1px solid ${(SEV_COLOUR[sev] || DIM)}55`, borderRadius: 2, padding: "0 4px" }}>{s.severity.toUpperCase()}</span>}
                            </div>
                            <div style={{ height: 3, borderRadius: 2, background: "rgba(255,255,255,0.08)", marginTop: 2 }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: SEV_COLOUR[sev] || RE }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {matchedRep.length === 0 && matchedOps.length === 0 && matchedSig.length === 0 && (
                    <div style={{ color: RE, fontSize: 10 }}>No intelligence coverage found for this investment.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess button + brief */}
      <div style={{ padding: "6px 14px 10px", borderTop: `1px solid rgba(234,179,8,0.18)` }}>
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(0,0,0,0.4)" : `${GO}22`,
            border: `1px solid ${GO}55`, borderRadius: 4, padding: "5px 14px",
            color: GO, fontSize: 10, cursor: assessing ? "not-allowed" : "pointer",
            fontFamily: FONT,
          }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS RISK INTELLIGENCE"}
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
