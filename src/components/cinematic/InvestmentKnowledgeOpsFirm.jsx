/**
 * F99 — Investment × Knowledge × Ops Event Financial Intelligence Readiness Monitor (IKOFIRM)
 * Parallel-fetches /entities/Investment + /knowledge/ + /v1/ops/events.
 * Keyword-correlates each investment against KB articles AND ops events to classify:
 *   FULLY_INFORMED  (KB + ops match) | OPS_TRACKED   (ops only)
 *   KB_RESEARCHED   (KB only)        | BLIND         (neither)
 * Red badge on blind count. Stat tiles INVESTMENTS/KB ARTICLES/OPS EVENTS/classifications.
 * Filter tabs ALL/FULLY_INFORMED/OPS_TRACKED/KB_RESEARCHED/BLIND + text search.
 * Expand investment → matched KB article cards (green) + ops event cards (blue) with relevance bars.
 * ▶ ASSESS READINESS → /v1/jarvis/agent/chat 2-sentence financial intel brief + TTS.
 * Voice trigger: "ikofirm/investment knowledge ops/financial intelligence/financial readiness/blind investments/investment intel readiness".
 * Event: jarvis:ikofirm-toggle | 90-s auto-refresh.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 998_360;
const Z_INDEX  = 161;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const IKOFIRM_RE = /\b(ikofirm|investment\s+knowledge\s+ops|financial\s+intelligence\s+readiness|financial\s+readiness|blind\s+investments|investment\s+intel\s+readiness|investment\s+ops\s+knowledge|portfolio\s+intelligence\s+readiness|ikofirm\s+monitor)\b/i;

const GR = "#22C55E";
const CY = "#00CFFF";
const AM = "#F59E0B";
const BL = "#3B82F6";
const RD = "#EF4444";
const GO = "#EAB308";
const BG = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_INFORMED: GR,
  OPS_TRACKED:    BL,
  KB_RESEARCHED:  CY,
  BLIND:          RD,
};

const TABS = ["ALL", "FULLY_INFORMED", "OPS_TRACKED", "KB_RESEARCHED", "BLIND"];
const TAB_LABELS = {
  ALL:            "ALL",
  FULLY_INFORMED: "FULLY INFORMED",
  OPS_TRACKED:    "OPS TRACKED",
  KB_RESEARCHED:  "KB RESEARCHED",
  BLIND:          "BLIND",
};

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isIkofirmQuery(text) {
  return IKOFIRM_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function kwTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function overlap(aStr, bStr) {
  const at = new Set(kwTokens(aStr));
  const bt = kwTokens(bStr);
  if (!at.size || !bt.length) return 0;
  return bt.filter(w => at.has(w)).length / Math.max(at.size, bt.length);
}

function scoreInvVsKb(inv, article) {
  const iStr = [inv.name, inv.type, inv.sector, inv.description,
    (inv.tags || []).join(" ")].join(" ");
  const aStr = [article.title, article.content, article.summary,
    (article.tags || []).join(" ")].join(" ");
  return overlap(iStr, aStr);
}

function scoreInvVsOps(inv, event) {
  const iStr = [inv.name, inv.type, inv.sector, inv.description,
    (inv.tags || []).join(" ")].join(" ");
  const eStr = [event.title, event.description, event.type, event.category,
    (event.tags || []).join(" ")].join(" ");
  return overlap(iStr, eStr);
}

const THRESHOLD = 0.04;

async function fetchAll() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [invRaw, kbRaw, opsRaw] = await Promise.all([
    fetch(`${base}/entities/Investment`, { headers }).then(r => r.json()),
    fetch(`${base}/knowledge/`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`, { headers }).then(r => r.json()),
  ]);
  const investments = norm(invRaw, ["investments", "items", "data", "results"]);
  const articles    = norm(kbRaw,  ["articles", "items", "data", "results", "knowledge"]);
  const events      = norm(opsRaw, ["events", "items", "data", "results"]);
  return { investments, articles, events };
}

function classify(investments, articles, events) {
  return investments.map(inv => {
    const kbMatches  = articles.map(a => ({ ...a, rel: scoreInvVsKb(inv, a) })).filter(a => a.rel >= THRESHOLD).sort((a, b) => b.rel - a.rel).slice(0, 5);
    const opsMatches = events.map(e => ({ ...e, rel: scoreInvVsOps(inv, e) })).filter(e => e.rel >= THRESHOLD).sort((a, b) => b.rel - a.rel).slice(0, 5);
    const hasKb  = kbMatches.length > 0;
    const hasOps = opsMatches.length > 0;
    let cls;
    if (hasKb && hasOps)  cls = "FULLY_INFORMED";
    else if (hasOps)      cls = "OPS_TRACKED";
    else if (hasKb)       cls = "KB_RESEARCHED";
    else                  cls = "BLIND";
    return { ...inv, cls, kbMatches, opsMatches };
  });
}

export async function buildIkofirmScript() {
  const { investments, articles, events } = await fetchAll();
  const classified = classify(investments, articles, events);
  const total = classified.length;
  const blind = classified.filter(i => i.cls === "BLIND").length;
  const fully = classified.filter(i => i.cls === "FULLY_INFORMED").length;
  const opsOnly = classified.filter(i => i.cls === "OPS_TRACKED").length;
  const kbOnly  = classified.filter(i => i.cls === "KB_RESEARCHED").length;
  const covPct  = total ? Math.round(((total - blind) / total) * 100) : 0;
  return `IKOFIRM financial intelligence readiness online, sir. Analysed ${total} investments against ${articles.length} knowledge articles and ${events.length} operational events. ${fully} investments are fully informed with both knowledge and operational coverage. ${blind} investments are blind — no KB research or ops-event correlation found, representing a financial intelligence gap of ${100 - covPct}%. ${opsOnly} are ops-tracked only and ${kbOnly} are KB-researched only. Recommend prioritising BLIND investments for immediate intelligence enrichment.`;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function InvestmentKnowledgeOpsFirm() {
  const [open, setOpen]   = useState(false);
  const [data, setData]   = useState(null);
  const [err,  setErr]    = useState(null);
  const [tab,  setTab]    = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { investments, articles, events } = await fetchAll();
      setData({ rows: classify(investments, articles, events), kbCount: articles.length, opsCount: events.length });
      setErr(null);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(o => !o);
    window.addEventListener("jarvis:ikofirm-toggle", handler);
    return () => window.removeEventListener("jarvis:ikofirm-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  if (!open) {
    const blindCount = data?.rows?.filter(r => r.cls === "BLIND").length || 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Investment × Knowledge × Ops Event Financial Intelligence Readiness Monitor (IKOFIRM)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${GO}55`,
          color: GO, fontFamily: FONT, fontSize: 10, padding: "4px 10px",
          borderRadius: 6, cursor: "pointer", letterSpacing: 1,
          boxShadow: blindCount > 0 ? `0 0 14px ${RD}66` : "none",
        }}>
        ◈ IKOFIRM{blindCount > 0 && <span style={{ marginLeft: 6, color: RD, fontWeight: 700 }}>{blindCount}</span>}
      </button>
    );
  }

  const rows = data?.rows || [];
  const filtered = rows.filter(r => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (search) {
      const s = search.toLowerCase();
      return (r.name || "").toLowerCase().includes(s) ||
             (r.type || "").toLowerCase().includes(s) ||
             (r.sector || "").toLowerCase().includes(s);
    }
    return true;
  });

  const total   = rows.length;
  const blind   = rows.filter(r => r.cls === "BLIND").length;
  const fully   = rows.filter(r => r.cls === "FULLY_INFORMED").length;
  const opsOnly = rows.filter(r => r.cls === "OPS_TRACKED").length;
  const kbOnly  = rows.filter(r => r.cls === "KB_RESEARCHED").length;
  const covPct  = total ? Math.round(((total - blind) / total) * 100) : 0;

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const ctx = `${total} investments: ${fully} fully informed, ${opsOnly} ops-tracked, ${kbOnly} KB-researched, ${blind} blind. KB articles: ${data?.kbCount}. Ops events: ${data?.opsCount}. Coverage: ${covPct}%.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Financial intelligence readiness assessment: ${ctx} Give a 2-sentence executive brief on investment intelligence gaps and recommended actions.` }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessText(txt);
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: txt, voice: "ash" }),
      }).then(async res => {
        if (res.ok) {
          const ab = await res.arrayBuffer();
          const ac = new (window.AudioContext || window.webkitAudioContext)();
          const buf = await ac.decodeAudioData(ab);
          const src = ac.createBufferSource(); src.buffer = buf;
          src.connect(ac.destination); src.start();
        }
      }).catch(() => {});
    } catch (e) {
      setAssessText("Assessment unavailable: " + e.message);
    }
    setAssessing(false);
  }

  function toggle(id) {
    setExpanded(x => ({ ...x, [id]: !x[id] }));
  }

  const clsBadge = (cls) => (
    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4,
      background: `${CLASS_COLOR[cls]}22`, color: CLASS_COLOR[cls],
      border: `1px solid ${CLASS_COLOR[cls]}55`, marginLeft: 8, letterSpacing: 1 }}>
      {cls.replace(/_/g, " ")}
    </span>
  );

  const relBar = (rel, color) => (
    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 3, height: 4, marginTop: 3, flex: 1 }}>
      <div style={{ width: `${Math.min(100, Math.round(rel * 100))}%`, height: "100%",
        background: color, borderRadius: 3, transition: "width 0.4s" }} />
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z_INDEX + 1000, background: "rgba(2,4,8,0.78)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: "min(960px,96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column",
        background: BG, border: `1px solid ${GO}44`, borderRadius: 14,
        boxShadow: `0 0 80px ${GO}18`, fontFamily: FONT, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: GO, fontSize: 13, letterSpacing: 2 }}>◈ IKOFIRM</span>
          <span style={{ color: "#6E8AA0", fontSize: 11 }}>Investment × Knowledge × Ops Event Financial Intelligence Readiness Monitor</span>
          <button onClick={() => setOpen(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "flex", gap: 8, padding: "10px 18px", flexWrap: "wrap" }}>
          {[
            ["INVESTMENTS", total, GO],
            ["KB ARTICLES", data?.kbCount ?? "—", CY],
            ["OPS EVENTS",  data?.opsCount ?? "—", BL],
            ["FULLY INFORMED", fully, GR],
            ["OPS TRACKED",   opsOnly, BL],
            ["KB RESEARCHED", kbOnly, CY],
            ["BLIND", blind, RD],
            ["COVERAGE", `${covPct}%`, covPct >= 70 ? GR : AM],
          ].map(([label, val, color]) => (
            <div key={label} style={{ flex: "1 1 80px", background: `${color}11`, border: `1px solid ${color}33`,
              borderRadius: 8, padding: "6px 10px", textAlign: "center" }}>
              <div style={{ color: color, fontSize: 16, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#6E8AA0", fontSize: 9, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: 6, padding: "6px 18px", flexWrap: "wrap", alignItems: "center" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "3px 10px", borderRadius: 5, fontSize: 10, cursor: "pointer", letterSpacing: 1,
              background: tab === t ? `${GO}22` : "transparent",
              border: `1px solid ${tab === t ? GO : "#2A3A4A"}`,
              color: tab === t ? GO : "#6E8AA0",
            }}>{TAB_LABELS[t]}</button>
          ))}
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="search investments…"
            style={{ marginLeft: "auto", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`,
              borderRadius: 6, color: "#DCEBF5", fontFamily: FONT, fontSize: 11, padding: "4px 10px", width: 200 }}
          />
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 18px 14px" }}>
          {err && <div style={{ color: RD, padding: 12, fontSize: 12 }}>Error: {err}</div>}
          {!data && !err && <div style={{ color: "#6E8AA0", padding: 12, fontSize: 12 }}>Loading…</div>}
          {filtered.map((inv, idx) => {
            const id = inv.id || inv._id || idx;
            const isOpen = !!expanded[id];
            return (
              <div key={id} style={{ borderBottom: `1px solid ${BORDER}`, padding: "8px 0" }}>
                <div onClick={() => toggle(id)} style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 8 }}>
                  <span style={{ color: "#6E8AA0", fontSize: 10 }}>{isOpen ? "▼" : "▶"}</span>
                  <span style={{ color: GO, fontSize: 12, flex: 1 }}>{inv.name || "Unknown Investment"}</span>
                  {inv.type && <span style={{ fontSize: 10, color: "#6E8AA0" }}>{inv.type}</span>}
                  {inv.sector && <span style={{ fontSize: 10, color: CY }}>{inv.sector}</span>}
                  {clsBadge(inv.cls)}
                </div>
                {isOpen && (
                  <div style={{ marginTop: 8, paddingLeft: 16 }}>
                    {/* KB matches */}
                    {inv.kbMatches.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ color: GR, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>KB ARTICLES ({inv.kbMatches.length})</div>
                        {inv.kbMatches.map((a, i) => (
                          <div key={i} style={{ background: `${GR}09`, border: `1px solid ${GR}22`, borderRadius: 6, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ color: "#DCEBF5", fontSize: 11 }}>{a.title || "Article"}</div>
                            {relBar(a.rel, GR)}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Ops event matches */}
                    {inv.opsMatches.length > 0 && (
                      <div>
                        <div style={{ color: BL, fontSize: 10, letterSpacing: 1, marginBottom: 4 }}>OPS EVENTS ({inv.opsMatches.length})</div>
                        {inv.opsMatches.map((e, i) => (
                          <div key={i} style={{ background: `${BL}09`, border: `1px solid ${BL}22`, borderRadius: 6, padding: "5px 8px", marginBottom: 4 }}>
                            <div style={{ color: "#DCEBF5", fontSize: 11 }}>{e.title || e.type || "Event"}</div>
                            {relBar(e.rel, BL)}
                          </div>
                        ))}
                      </div>
                    )}
                    {inv.kbMatches.length === 0 && inv.opsMatches.length === 0 && (
                      <div style={{ color: "#6E8AA0", fontSize: 11 }}>No KB or ops-event correlations found.</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {data && filtered.length === 0 && (
            <div style={{ color: "#6E8AA0", padding: 12, fontSize: 12 }}>No results for current filter.</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${BORDER}`, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <button onClick={assess} disabled={assessing || !data} style={{
            background: assessing ? "rgba(255,255,255,0.04)" : `${GO}22`,
            border: `1px solid ${GO}55`, color: GO, fontFamily: FONT,
            fontSize: 11, padding: "5px 14px", borderRadius: 6, cursor: assessing ? "not-allowed" : "pointer",
            letterSpacing: 1, whiteSpace: "nowrap",
          }}>{assessing ? "…" : "▶ ASSESS READINESS"}</button>
          {assessText && (
            <div style={{ color: "#DCEBF5", fontSize: 11, lineHeight: 1.5, flex: 1 }}>{assessText}</div>
          )}
        </div>
      </div>
    </div>
  );
}
