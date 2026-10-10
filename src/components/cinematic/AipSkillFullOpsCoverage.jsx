/**
 * F138 — AIP Skill × Contact × Report × Ops Event Full Operational Coverage Hub (FOCOH)
 *
 * Parallel-fetches /v1/aip/skill + /entities/Contact + /v1/reports + /v1/ops/events.
 * Keyword-correlates each AIP skill against contacts AND reports AND ops events:
 *   FULLY_ACTIVE  — matched all three sources
 *   DUAL_ACTIVE   — matched any two sources
 *   SINGLE_ACTIVE — matched exactly one source
 *   DORMANT       — no matches (activation gap)
 *
 * Stat tiles: AIP SKILLS / CONTACTS / REPORTS / OPS EVENTS + all four class counts + COVERAGE%.
 * Amber badge on dormant count.
 * Filter tabs ALL / FULLY_ACTIVE / DUAL_ACTIVE / SINGLE_ACTIVE / DORMANT + text search.
 * Expand skill → matched contact cards (orange) + report cards (purple) +
 *                ops event cards (blue) with relevance bars.
 * ▶ ASSESS COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90-s auto-refresh. jarvis:focoh-toggle event.
 *
 * Voice triggers: "focoh / full operational coverage / skill activation /
 *                  operational hub / active skills coverage / skill ops coverage".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_020_200;
const Z_INDEX  = 200;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const FOCOH_RE = /\b(focoh|full[\s-]operational[\s-]coverage|skill[\s-]activation|operational[\s-]hub|active[\s-]skills?[\s-]coverage|skill[\s-]ops[\s-]coverage)\b/i;

// ── colour palette ────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const OR     = "#F97316";
const AM     = "#F59E0B";
const PU     = "#A855F7";
const BL     = "#3B82F6";
const GR     = "#22C55E";
const TE     = "#14B8A6";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

const CLASS_COLOR = {
  FULLY_ACTIVE:  GR,
  DUAL_ACTIVE:   CY,
  SINGLE_ACTIVE: OR,
  DORMANT:       AM,
};
const TABS = ["ALL", "FULLY_ACTIVE", "DUAL_ACTIVE", "SINGLE_ACTIVE", "DORMANT"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isFocohQuery(text) {
  return FOCOH_RE.test(text || "");
}

export async function buildFocohScript() {
  const base = apiBase();
  const hdr = { Authorization: `Bearer ${API_KEY}` };
  const [sRes, cRes, rRes, oRes] = await Promise.allSettled([
    fetch(`${base}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/entities/Contact`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/reports`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
  ]);
  const skills   = norm(sRes.status === "fulfilled" ? sRes.value : [], ["skills","items","results","data"]);
  const contacts = norm(cRes.status === "fulfilled" ? cRes.value : [], ["items","results","data"]);
  const reports  = norm(rRes.status === "fulfilled" ? rRes.value : [], ["reports","items","results","data"]);
  const events   = norm(oRes.status === "fulfilled" ? oRes.value : [], ["events","items","results","data"]);
  let dormant = 0, fully = 0;
  for (const sk of skills) {
    const sw = words(`${sk.name||""} ${sk.description||""} ${sk.type||""}`);
    const mc = contacts.some(c => relevance_words(sw, words(`${c.name||""} ${c.role||""} ${c.org||""} ${(c.tags||[]).join(" ")}`)) > 0);
    const mr = reports.some(r => relevance_words(sw, words(`${r.title||r.name||""} ${r.description||""} ${(r.tags||[]).join(" ")}`)) > 0);
    const mo = events.some(e => relevance_words(sw, words(`${e.title||e.name||""} ${e.description||""} ${e.type||""}`)) > 0);
    const hits = [mc, mr, mo].filter(Boolean).length;
    if (hits === 3) fully++;
    if (hits === 0) dormant++;
  }
  const cov = skills.length ? Math.round(((skills.length - dormant) / skills.length) * 100) : 0;
  const ctx = `AIP Skills: ${skills.length}, Contacts: ${contacts.length}, Reports: ${reports.length}, Ops Events: ${events.length}. Fully active: ${fully}. Dormant (zero activation): ${dormant}. Coverage: ${cov}%.`;
  const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: `FOCOH Full Operational Coverage Hub status: ${ctx} In 2 sentences, summarise the skill activation landscape and recommend priority action.` }),
  }).then(r => r.json()).catch(() => ({ answer: "" }));
  return (brief.answer || `FOCOH online, sir. ${skills.length} AIP skills cross-referenced against ${contacts.length} contacts, ${reports.length} reports, and ${events.length} ops events. ${dormant} skills remain dormant with no operational activation — coverage stands at ${cov}%.`).replace(/<<ACTION:[^>]*>>/g, "").trim();
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function words(str) {
  return (str || "").toLowerCase().split(/\W+/).filter(w => w.length > 2);
}

function relevance_words(aw, bw) {
  if (!aw.length || !bw.length) return 0;
  return aw.filter(w => bw.includes(w)).length;
}

function relevance(a, b) {
  const aw = words(`${a.name||a.title||""} ${a.description||""} ${a.type||""} ${(a.tags||[]).join ? (a.tags||[]).join(" ") : ""}`);
  const bw = words(`${b.name||b.title||""} ${b.description||""} ${b.type||""} ${(b.tags||[]).join ? (b.tags||[]).join(" ") : ""}`);
  if (!aw.length || !bw.length) return 0;
  const hits = aw.filter(w => bw.includes(w)).length;
  return Math.min(100, Math.round((hits / Math.min(aw.length, bw.length)) * 100));
}

function classify(skill, contacts, reports, events) {
  const matchC = contacts.filter(c => relevance(skill, c) > 0);
  const matchR = reports.filter(r => relevance(skill, r) > 0);
  const matchO = events.filter(e => relevance(skill, e) > 0);
  const hits = [matchC.length > 0, matchR.length > 0, matchO.length > 0].filter(Boolean).length;
  let cls;
  if (hits === 3) cls = "FULLY_ACTIVE";
  else if (hits === 2) cls = "DUAL_ACTIVE";
  else if (hits === 1) cls = "SINGLE_ACTIVE";
  else cls = "DORMANT";
  return { cls, matchC, matchR, matchO };
}

// ── sub-components ────────────────────────────────────────────────────────────

function Bar({ pct, color }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 3, height: 4, marginTop: 3 }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: color, transition: "width .4s" }} />
    </div>
  );
}

function MatchCard({ item, color, badge }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${color}33`, borderRadius: 6, padding: "5px 8px", marginBottom: 4, fontSize: 11 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#D0E8F5" }}>{item.name || item.title || item.id || "—"}</span>
        <span style={{ background: color + "33", color, borderRadius: 4, padding: "1px 5px", fontSize: 10 }}>{badge}</span>
      </div>
      <Bar pct={Math.max(8, relevance_words(
        words(`${item.name||item.title||""} ${item.description||""}`),
        words(`${item.name||item.title||""} ${item.description||""}`)) * 8 + 20)} color={color} />
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function AipSkillFullOpsCoverage() {
  const [open, setOpen]         = useState(false);
  const [skills, setSkills]     = useState([]);
  const [contacts, setContacts] = useState([]);
  const [reports, setReports]   = useState([]);
  const [events, setEvents]     = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief, setBrief]       = useState("");
  const [dormantBadge, setDormantBadge] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [sRes, cRes, rRes, oRes] = await Promise.allSettled([
        fetch(`${base}/v1/aip/skill`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/entities/Contact`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/reports`, { headers: hdr }).then(r => r.json()),
        fetch(`${base}/v1/ops/events`, { headers: hdr }).then(r => r.json()),
      ]);
      const sk = norm(sRes.status === "fulfilled" ? sRes.value : [], ["skills","items","results","data"]);
      const ct = norm(cRes.status === "fulfilled" ? cRes.value : [], ["items","results","data"]);
      const rp = norm(rRes.status === "fulfilled" ? rRes.value : [], ["reports","items","results","data"]);
      const ev = norm(oRes.status === "fulfilled" ? oRes.value : [], ["events","items","results","data"]);
      setSkills(sk); setContacts(ct); setReports(rp); setEvents(ev);
      setDormantBadge(sk.filter(s => classify(s, ct, rp, ev).cls === "DORMANT").length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => { if (!o) load(); return !o; });
    window.addEventListener("jarvis:focoh-toggle", onToggle);
    return () => window.removeEventListener("jarvis:focoh-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  async function assess() {
    setAssessing(true); setBrief("");
    try {
      const script = await buildFocohScript();
      setBrief(script);
    } catch { setBrief("Unable to generate FOCOH brief."); }
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: FONT, fontSize: 10, letterSpacing: 1,
          padding: "4px 8px", borderRadius: 5, cursor: "pointer",
          backdropFilter: "blur(6px)",
        }}
      >
        ◈ FOCOH
        {dormantBadge > 0 && (
          <span style={{ marginLeft: 5, background: AM, color: "#04060A", borderRadius: 4, padding: "0 5px", fontSize: 9 }}>
            {dormantBadge}
          </span>
        )}
      </button>
    );
  }

  const enriched = skills.map(sk => ({ sk, ...classify(sk, contacts, reports, events) }));
  const counts = { FULLY_ACTIVE: 0, DUAL_ACTIVE: 0, SINGLE_ACTIVE: 0, DORMANT: 0 };
  enriched.forEach(e => counts[e.cls]++);
  const cov = skills.length ? Math.round(((skills.length - counts.DORMANT) / skills.length) * 100) : 0;

  const filtered = enriched.filter(e => {
    if (tab !== "ALL" && e.cls !== tab) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.sk.name||"").toLowerCase().includes(q) || (e.sk.description||"").toLowerCase().includes(q);
  });

  return (
    <div style={{
      position: "fixed", left: 20, top: 20, zIndex: Z_INDEX,
      width: "min(760px,92vw)", maxHeight: "90vh",
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 14, fontFamily: FONT, color: "#D0E8F5",
      display: "flex", flexDirection: "column", overflow: "hidden",
      boxShadow: `0 0 60px ${CY}18`,
    }}>
      {/* header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 2 }}>◈ FOCOH</span>
        <span style={{ fontSize: 10, color: "#6E8AA0", flex: 1 }}>AIP Skill × Contact × Report × Ops Event Full Operational Coverage Hub</span>
        {loading && <span style={{ fontSize: 10, color: CY }}>↻</span>}
        <button onClick={assess} disabled={assessing} style={{ background: AM + "22", border: `1px solid ${AM}55`, color: AM, borderRadius: 5, padding: "3px 9px", fontSize: 10, cursor: "pointer", fontFamily: FONT }}>
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["AIP SKILLS", skills.length, CY],
          ["CONTACTS", contacts.length, OR],
          ["REPORTS", reports.length, PU],
          ["OPS EVENTS", events.length, BL],
          ["FULLY ACTIVE", counts.FULLY_ACTIVE, GR],
          ["DUAL ACTIVE", counts.DUAL_ACTIVE, CY],
          ["SINGLE ACTIVE", counts.SINGLE_ACTIVE, OR],
          ["DORMANT", counts.DORMANT, AM],
          [`COVERAGE ${cov}%`, cov, GR],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: col + "14", border: `1px solid ${col}33`, borderRadius: 6, padding: "4px 10px", textAlign: "center", minWidth: 70 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: col }}>{typeof val === "number" && label.startsWith("COV") ? `${val}%` : val}</div>
            <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label.startsWith("COV") ? "COVERAGE" : label}</div>
          </div>
        ))}
      </div>

      {/* brief */}
      {brief && (
        <div style={{ margin: "0 16px 8px", padding: "8px 12px", background: AM + "12", border: `1px solid ${AM}44`, borderRadius: 7, fontSize: 11, color: "#D0E8F5", lineHeight: 1.6 }}>
          {brief}
        </div>
      )}

      {/* tabs + search */}
      <div style={{ padding: "0 16px 8px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              background: tab === t ? CY + "22" : "transparent",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : "#6E8AA0", borderRadius: 4,
              padding: "3px 9px", fontSize: 10, cursor: "pointer", fontFamily: FONT,
            }}>{t}</button>
          ))}
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search skills…"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(255,255,255,0.04)", border: `1px solid ${BORDER}`, borderRadius: 5, padding: "5px 10px", color: "#D0E8F5", fontSize: 11, fontFamily: FONT, outline: "none" }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 16px" }}>
        {filtered.length === 0 && !loading && (
          <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 11, marginTop: 20 }}>No skills match filters.</div>
        )}
        {filtered.map((e, i) => {
          const { sk, cls, matchC, matchR, matchO } = e;
          const isExp = expanded === i;
          const col = CLASS_COLOR[cls];
          return (
            <div key={i} style={{ borderBottom: `1px solid ${BORDER}`, padding: "8px 0" }}>
              <div
                onClick={() => setExpanded(isExp ? null : i)}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
              >
                <span style={{ background: col + "22", color: col, borderRadius: 4, padding: "1px 6px", fontSize: 10, minWidth: 84, textAlign: "center" }}>{cls}</span>
                <span style={{ flex: 1, fontSize: 12 }}>{sk.name || sk.id || "—"}</span>
                <span style={{ fontSize: 10, color: OR }}>{matchC.length}C</span>
                <span style={{ fontSize: 10, color: PU }}>{matchR.length}R</span>
                <span style={{ fontSize: 10, color: BL }}>{matchO.length}O</span>
                <span style={{ color: "#6E8AA0", fontSize: 12 }}>{isExp ? "▲" : "▼"}</span>
              </div>
              {sk.description && <div style={{ fontSize: 10, color: "#6E8AA0", marginTop: 2, paddingLeft: 92 }}>{sk.description.slice(0, 100)}</div>}
              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 8 }}>
                  {matchC.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: OR, letterSpacing: 1, marginBottom: 4 }}>MATCHED CONTACTS ({matchC.length})</div>
                      {matchC.slice(0, 5).map((c, j) => <MatchCard key={j} item={c} color={OR} badge={c.role || "contact"} />)}
                    </div>
                  )}
                  {matchR.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 10, color: PU, letterSpacing: 1, marginBottom: 4 }}>MATCHED REPORTS ({matchR.length})</div>
                      {matchR.slice(0, 5).map((r, j) => <MatchCard key={j} item={r} color={PU} badge={r.type || "report"} />)}
                    </div>
                  )}
                  {matchO.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: BL, letterSpacing: 1, marginBottom: 4 }}>MATCHED OPS EVENTS ({matchO.length})</div>
                      {matchO.slice(0, 5).map((o, j) => <MatchCard key={j} item={o} color={BL} badge={o.type || "event"} />)}
                    </div>
                  )}
                  {matchC.length === 0 && matchR.length === 0 && matchO.length === 0 && (
                    <div style={{ fontSize: 11, color: AM, padding: "6px 0" }}>No operational activation found for this skill.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
