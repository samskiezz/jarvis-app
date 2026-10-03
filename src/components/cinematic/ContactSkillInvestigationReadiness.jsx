/**
 * F181 — Contact × AIP Skill × Investigation — Operator Mission Readiness (OMRDY)
 *
 * Parallel-fetches /entities/Contact + /v1/aip/skill + /v1/investigations every 90 s.
 * Keyword-correlates each contact against matched AIP skills AND open investigations:
 *
 *   FULLY_READY   — matched ≥1 skill AND ≥1 investigation
 *   SKILLED_ONLY  — skill matched, no investigation linked
 *   CASE_ASSIGNED — investigation linked, no skill matched
 *   UNREADY       — neither — a contact with no skill coverage or open case
 *
 * Stat tiles: contacts / skills / investigations / fully ready / unready
 * Filter tabs: ALL | FULLY_READY | SKILLED_ONLY | CASE_ASSIGNED | UNREADY
 * Text search on contact name / role / org.
 * Expand row → matched skills (green bars) + matched investigations (amber bars).
 * Amber badge + pulse on UNREADY count.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operator readiness brief + TTS.
 *
 * Toggle:  ◈ OMRDY  at bottom:8 left:975100, zIndex:682.
 * Event:   jarvis:omrdy-toggle
 * Voice:   "omrdy / operator readiness / contact mission readiness / unready operator /
 *           mission readiness / contact skill readiness / operator skill gap /
 *           contact investigation readiness / mission capability"
 * Refresh: 90 s auto-poll.
 */
import { useEffect, useRef, useState } from "react";

const BTN_LEFT = 975_100;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof window !== "undefined" && window.__JARVIS_API_BASE__) return window.__JARVIS_API_BASE__;
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── Exported intent helpers ───────────────────────────────────────────────────

const OMRDY_RE =
  /\b(omrdy|operator\s+readiness|contact\s+mission\s+readiness|unready\s+operator|mission\s+readiness|contact\s+skill\s+readiness|operator\s+skill\s+gap|contact\s+investigation\s+readiness|mission\s+capability)\b/i;

export function isOmrdyQuery(q) { return OMRDY_RE.test(q || ""); }

export async function buildOmrdyScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, sRes, iRes] = await Promise.all([
      fetch(`${base}/entities/Contact`,     { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,         { headers: hdr }),
      fetch(`${base}/v1/investigations`,    { headers: hdr }),
    ]);
    const contacts       = normArr(await cRes.json(), ["contacts", "data", "items", "results"]);
    const skills         = normArr(await sRes.json(), ["skills", "data", "items", "results"]);
    const investigations = normArr(await iRes.json(), ["investigations", "cases", "data", "items", "results"]);

    const rows    = classifyContacts(contacts, skills, investigations);
    const unready = rows.filter((r) => r.cls === "UNREADY").length;
    const ready   = rows.filter((r) => r.cls === "FULLY_READY").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS operator mission readiness audit (OMRDY): ${contacts.length} contacts ` +
          `cross-referenced against ${skills.length} AIP skills and ${investigations.length} investigations — ` +
          `${ready} fully ready (skill + case), ${unready} unready (no skill or case coverage). ` +
          `Give a 2-sentence operator readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Operator mission readiness audit complete, sir.").trim();
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:omrdy-toggle"));
    return "Operator mission readiness analysis unavailable at this time, sir.";
  }
}

// ── Normalisers ───────────────────────────────────────────────────────────────

function normArr(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of keys) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function score(aKws, other) {
  const otherKws = new Set(kw(other));
  return aKws.filter((w) => otherKws.has(w)).length;
}

function classifyContacts(contacts, skills, investigations) {
  return contacts.map((c) => {
    const cKws = kw(c);
    const matchedSkills = skills
      .map((s) => ({ ...s, score: score(cKws, s) }))
      .filter((s) => s.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    const matchedInvestigations = investigations
      .map((i) => ({ ...i, score: score(cKws, i) }))
      .filter((i) => i.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const hasSkill = matchedSkills.length > 0;
    const hasCase  = matchedInvestigations.length > 0;
    const cls =
      hasSkill && hasCase ? "FULLY_READY"   :
      hasSkill            ? "SKILLED_ONLY"  :
      hasCase             ? "CASE_ASSIGNED" :
                            "UNREADY";

    return {
      id:    c.id || c._id || c.contact_id || String(Math.random()),
      name:  c.name || c.full_name || c.display_name || c.email || "Unknown Contact",
      role:  c.role || c.title || c.position || "",
      org:   c.org || c.organisation || c.organization || c.company || "",
      cls,
      matchedSkills,
      matchedInvestigations,
      extra: c,
    };
  });
}

// ── Style constants ───────────────────────────────────────────────────────────

const CLS_COLOR = {
  FULLY_READY:   "#22C55E",
  SKILLED_ONLY:  "#22D3EE",
  CASE_ASSIGNED: "#A78BFA",
  UNREADY:       "#F59E0B",
};
const CLS_LABEL = {
  FULLY_READY:   "FULLY READY",
  SKILLED_ONLY:  "SKILLED ONLY",
  CASE_ASSIGNED: "CASE ASSIGNED",
  UNREADY:       "UNREADY",
};

const TABS = ["ALL", "FULLY_READY", "SKILLED_ONLY", "CASE_ASSIGNED", "UNREADY"];
const GN   = "#22C55E";
const CY   = "#22D3EE";
const AM   = "#F59E0B";

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContactSkillInvestigationReadiness() {
  const [open, setOpen]               = useState(false);
  const [rows, setRows]               = useState([]);
  const [skillCount, setSkillCount]   = useState(0);
  const [caseCount, setCaseCount]     = useState(0);
  const [loading, setLoading]         = useState(false);
  const [tab, setTab]                 = useState("ALL");
  const [search, setSearch]           = useState("");
  const [expanded, setExpanded]       = useState(null);
  const [assessing, setAssessing]     = useState(false);
  const [assessment, setAssessment]   = useState("");
  const timerRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, sRes, iRes] = await Promise.all([
        fetch(`${base}/entities/Contact`,     { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,         { headers: hdr }),
        fetch(`${base}/v1/investigations`,    { headers: hdr }),
      ]);
      const contacts       = normArr(await cRes.json(), ["contacts", "data", "items", "results"]);
      const skills         = normArr(await sRes.json(), ["skills", "data", "items", "results"]);
      const investigations = normArr(await iRes.json(), ["investigations", "cases", "data", "items", "results"]);
      setSkillCount(skills.length);
      setCaseCount(investigations.length);
      setRows(classifyContacts(contacts, skills, investigations));
    } catch {
      /* backend may be down — keep stale rows */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:omrdy-toggle", toggle);
    return () => window.removeEventListener("jarvis:omrdy-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const unreadyCount   = rows.filter((r) => r.cls === "UNREADY").length;
  const readyCount     = rows.filter((r) => r.cls === "FULLY_READY").length;
  const skilledCount   = rows.filter((r) => r.cls === "SKILLED_ONLY").length;
  const caseOnlyCount  = rows.filter((r) => r.cls === "CASE_ASSIGNED").length;

  const visible = rows.filter((r) => {
    if (tab !== "ALL" && r.cls !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (r.name + r.role + r.org).toLowerCase().includes(s);
  });

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `JARVIS OMRDY operator mission readiness audit: ${rows.length} contacts — ` +
            `${readyCount} fully ready (skill + case), ${skilledCount} skilled-only, ` +
            `${caseOnlyCount} case-assigned, ${unreadyCount} unready (no skill or case coverage). ` +
            `Give a 2-sentence operator readiness brief — formal British butler tone.`,
        }),
      });
      const d   = await r.json();
      const txt = (d.answer || "Operator mission readiness assessment complete, sir.").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable at this time, sir.");
    } finally {
      setAssessing(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 682,
          background: "rgba(8,14,22,0.82)", border: `1px solid ${AM}55`,
          borderRadius: 6, padding: "3px 9px", cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
          color: AM, letterSpacing: 2,
          boxShadow: unreadyCount > 0 ? `0 0 12px ${AM}88` : "none",
          animation: unreadyCount > 0 ? "omrdyPulse 1.8s ease-in-out infinite" : "none",
        }}
      >
        ◈ OMRDY
        {unreadyCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 9, padding: "1px 5px", fontSize: 9,
          }}>
            {unreadyCount}
          </span>
        )}
        <style>{`@keyframes omrdyPulse{0%,100%{box-shadow:0 0 8px ${AM}55}50%{box-shadow:0 0 18px ${AM}}}`}</style>
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 8, left: BTN_LEFT - 440, zIndex: 682,
      width: "min(500px,92vw)", maxHeight: "82vh", overflowY: "auto",
      background: "rgba(6,11,18,0.94)", border: `1px solid ${AM}44`,
      borderRadius: 12, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${AM}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5", fontSize: 11,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ color: AM, fontWeight: 700, letterSpacing: 3, fontSize: 12 }}>◈ OMRDY</span>
        <span style={{ color: "#6E8AA0", fontSize: 10 }}>OPERATOR MISSION READINESS</span>
        <span style={{ marginLeft: "auto", cursor: "pointer", color: "#6E8AA0" }} onClick={() => setOpen(false)}>✕</span>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {[
          ["CONTACTS",   rows.length,    AM],
          ["SKILLS",     skillCount,     GN],
          ["CASES",      caseCount,      "#A78BFA"],
          ["READY",      readyCount,     GN],
          ["SKILLED",    skilledCount,   CY],
          ["CASE ONLY",  caseOnlyCount,  "#A78BFA"],
          ["UNREADY",    unreadyCount,   AM],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(245,158,11,0.06)", border: `1px solid ${col}33`,
            borderRadius: 6, padding: "4px 8px", textAlign: "center", minWidth: 56,
          }}>
            <div style={{ color: col, fontSize: 13, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#6E8AA0", fontSize: 9 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || AM}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || AM) : "#1E3A4A"}`,
            borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 9,
            color: tab === t ? (CLS_COLOR[t] || AM) : "#6E8AA0", letterSpacing: 1,
          }}>
            {t === "ALL" ? "ALL" : CLS_LABEL[t] || t}
          </button>
        ))}
      </div>
      <input
        value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="search contacts…"
        style={{
          width: "100%", boxSizing: "border-box", marginBottom: 8,
          background: "rgba(245,158,11,0.05)", border: `1px solid ${AM}33`,
          borderRadius: 5, padding: "4px 8px", color: "#DCEBF5", fontSize: 11,
          fontFamily: "'JetBrains Mono',monospace",
        }}
      />

      {loading && <div style={{ color: "#6E8AA0", marginBottom: 8 }}>Loading contacts…</div>}

      {/* Contact rows */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.map((row) => (
          <div key={row.id}>
            <div
              onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 8px",
                background: "rgba(245,158,11,0.04)", border: `1px solid ${CLS_COLOR[row.cls]}33`,
                borderRadius: 6, cursor: "pointer",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: CLS_COLOR[row.cls], flexShrink: 0 }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {row.name}
              </span>
              {row.role && (
                <span style={{ fontSize: 9, color: "#6E8AA0", background: "rgba(0,0,0,0.3)",
                  padding: "1px 4px", borderRadius: 3, maxWidth: 80,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.role}
                </span>
              )}
              <span style={{ fontSize: 9, color: CLS_COLOR[row.cls], letterSpacing: 1 }}>
                {CLS_LABEL[row.cls]}
              </span>
              <span style={{ color: "#6E8AA0", fontSize: 10 }}>
                {expanded === row.id ? "▲" : "▼"}
              </span>
            </div>

            {expanded === row.id && (
              <div style={{
                margin: "2px 0 2px 16px", padding: "8px 10px",
                background: "rgba(245,158,11,0.03)", border: `1px solid ${AM}22`,
                borderRadius: 6, display: "flex", gap: 12, flexWrap: "wrap",
              }}>
                {/* Skills */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: GN, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    SKILLS ({row.matchedSkills.length})
                  </div>
                  {row.matchedSkills.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedSkills.map((s, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {s.name || s.skill_name || s.title || s.id || `Skill ${i + 1}`}
                          </span>
                          <span style={{ color: GN }}>{s.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${GN}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, s.score * 20)}%`,
                            background: GN, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
                {/* Investigations */}
                <div style={{ flex: 1, minWidth: 150 }}>
                  <div style={{ color: AM, fontSize: 9, letterSpacing: 2, marginBottom: 4 }}>
                    INVESTIGATIONS ({row.matchedInvestigations.length})
                  </div>
                  {row.matchedInvestigations.length === 0
                    ? <div style={{ color: "#6E8AA0", fontSize: 9 }}>none matched</div>
                    : row.matchedInvestigations.map((inv, i) => (
                      <div key={i} style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#DCEBF5" }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                            {inv.title || inv.name || inv.subject || inv.investigation_id || `Case ${i + 1}`}
                          </span>
                          <span style={{ color: AM }}>{inv.score}</span>
                        </div>
                        <div style={{ height: 3, background: `${AM}22`, borderRadius: 2, marginTop: 1 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, inv.score * 20)}%`,
                            background: AM, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#6E8AA0", textAlign: "center", padding: "12px 0" }}>
            No contacts match current filter.
          </div>
        )}
      </div>

      {/* Assess button + result */}
      <div style={{ marginTop: 10 }}>
        <button onClick={assess} disabled={assessing} style={{
          background: assessing ? "rgba(245,158,11,0.1)" : `${AM}18`,
          border: `1px solid ${AM}55`, borderRadius: 5, padding: "4px 12px",
          cursor: assessing ? "default" : "pointer", color: AM, fontSize: 10,
          fontFamily: "'JetBrains Mono',monospace", letterSpacing: 1,
        }}>
          {assessing ? "⟳ assessing…" : "▶ ASSESS"}
        </button>
        {assessment && (
          <div style={{
            marginTop: 8, padding: "7px 10px", background: "rgba(245,158,11,0.05)",
            border: `1px solid ${AM}33`, borderRadius: 6, fontSize: 11,
            color: "#DCEBF5", lineHeight: 1.5,
          }}>
            {assessment}
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, color: "#334F62", fontSize: 9 }}>
        auto-refresh {POLL_MS / 1000}s · {rows.length} contacts · {skillCount} skills · {caseCount} investigations
      </div>
    </div>
  );
}
