/**
 * OpsSkillContactAlignment — F240.
 *
 * Parallel-fetches /v1/ops/events × /v1/aip/skill × /entities/Contact
 * and keyword-correlates each ops event against available AIP skills AND
 * assigned contacts to classify:
 *
 *   FULLY_ALIGNED  — event has ≥1 matching AIP skill AND ≥1 matching contact
 *   SKILL_ONLY     — skill available but no contact assigned
 *   CONTACT_ONLY   — contact assigned but no matching skill
 *   UNALIGNED      — no skill or contact coverage (response gap)
 *
 * Stat tiles: OPS EVENTS / AIP SKILLS / CONTACTS / UNALIGNED
 * Amber badge: UNALIGNED count on toggle button.
 * Filter tabs: ALL | FULLY_ALIGNED | SKILL_ONLY | CONTACT_ONLY | UNALIGNED + text search.
 * Expand event → matched AIP skill cards (cyan) + contact cards (orange) with relevance bars.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational alignment brief + TTS.
 *
 * Toggle:  ◈ OASALIGN at left:1091120, bottom:8, zIndex:664.
 * Event:   jarvis:oasalign-toggle
 * Voice:   "oasalign" / "ops alignment" / "skill ops" / "contact ops alignment" /
 *          "unaligned ops" / "response alignment" / "ops skill contact"
 * Refresh: 90s auto-refresh while open.
 * Additive only — mounted via App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const RD  = "#FF3D3D";
const CY  = "#00E5FF";
const AM  = "#FFB300";
const OR  = "#FF9800";
const DIM = "rgba(255,255,255,0.04)";
const BG  = "rgba(6,10,18,0.94)";
const MN  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT   = 1091120;
const Z_IDX      = 664;

const OASALIGN_RE =
  /\b(oasalign|ops[._\-\s]alignment|skill[._\-\s]ops|contact[._\-\s]ops[._\-\s]alignment|unaligned[._\-\s]ops|response[._\-\s]alignment|ops[._\-\s]skill[._\-\s]contact)\b/i;

export function isOasalignQuery(t) {
  return OASALIGN_RE.test(t || "");
}

// ── normalisers ───────────────────────────────────────────────────────────────

function normOpsEvents(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.events || raw.ops_events || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((e, i) => ({
    id:    e.id || String(i),
    name:  e.name || e.title || e.event || e.summary || `Ops Event ${i + 1}`,
    desc:  e.description || e.detail || e.summary || "",
    type:  e.type || e.category || e.kind || "",
    sev:   e.severity || e.level || e.priority || "",
  }));
}

function normSkills(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.skills || raw.aip_skills || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((s, i) => ({
    id:      s.id || String(i),
    name:    s.name || s.title || s.skill || `AIP Skill ${i + 1}`,
    desc:    s.description || s.summary || s.detail || "",
    type:    s.type || s.category || s.kind || "",
    enabled: s.enabled !== false,
  }));
}

function normContacts(raw) {
  if (!raw) return [];
  const arr = raw.items || raw.contacts || raw.data || raw.results || (Array.isArray(raw) ? raw : []);
  return arr.map((c, i) => ({
    id:   c.id || String(i),
    name: c.name || c.full_name || `Contact ${i + 1}`,
    role: c.role || c.title || c.position || "",
    org:  c.org || c.organisation || c.organization || c.company || "",
    tags: Array.isArray(c.tags) ? c.tags.join(" ") : (c.tags || ""),
  }));
}

function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevanceScore(event, other) {
  const eWords = new Set(tokens(`${event.name} ${event.desc} ${event.type}`));
  const oWords = tokens(`${other.name} ${other.desc} ${other.type || ""} ${other.role || ""} ${other.tags || ""}`);
  const hits = oWords.filter(w => eWords.has(w));
  return hits.length / Math.max(oWords.length, 1);
}

function classify(events, skills, contacts) {
  return events.map(ev => {
    const matchedSkills = skills
      .map(s => ({ ...s, score: relevanceScore(ev, s) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const matchedContacts = contacts
      .map(c => ({ ...c, score: relevanceScore(ev, c) }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score);

    let alignment;
    if (matchedSkills.length > 0 && matchedContacts.length > 0) {
      alignment = "FULLY_ALIGNED";
    } else if (matchedSkills.length > 0) {
      alignment = "SKILL_ONLY";
    } else if (matchedContacts.length > 0) {
      alignment = "CONTACT_ONLY";
    } else {
      alignment = "UNALIGNED";
    }

    return { ...ev, alignment, matchedSkills, matchedContacts };
  });
}

// ── voice script ─────────────────────────────────────────────────────────────

export async function buildOasalignScript() {
  const base = apiBase();
  const [eRaw, sRaw, cRaw] = await Promise.all([
    fetch(`${base}/ops/events`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/aip/skill`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
    fetch(`${base}/entities/Contact`,{ headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
  ]);
  const events   = normOpsEvents(eRaw);
  const skills   = normSkills(sRaw);
  const contacts = normContacts(cRaw);
  const rows     = classify(events, skills, contacts);
  const unaligned = rows.filter(r => r.alignment === "UNALIGNED").length;
  const aligned   = rows.filter(r => r.alignment === "FULLY_ALIGNED").length;
  return `Operational Response Alignment active, sir. Of ${events.length} ops events cross-referenced against ${skills.length} AIP skills and ${contacts.length} contacts, ${aligned} are fully aligned — but ${unaligned} events have no skill or contact coverage and represent active response gaps requiring immediate assignment.`;
}

// ── status colour ─────────────────────────────────────────────────────────────

function statusColour(s) {
  if (s === "FULLY_ALIGNED")  return "#4CAF50";
  if (s === "SKILL_ONLY")     return CY;
  if (s === "CONTACT_ONLY")   return OR;
  return AM;
}

// ── component ────────────────────────────────────────────────────────────────

export default function OpsSkillContactAlignment() {
  const [open,          setOpen]          = useState(false);
  const [rows,          setRows]          = useState([]);
  const [opsCount,      setOpsCount]      = useState(0);
  const [skillCount,    setSkillCount]    = useState(0);
  const [contactCount,  setContactCount]  = useState(0);
  const [loading,       setLoading]       = useState(false);
  const [err,           setErr]           = useState(null);
  const [filter,        setFilter]        = useState("ALL");
  const [search,        setSearch]        = useState("");
  const [expanded,      setExpanded]      = useState(null);
  const [assessing,     setAssessing]     = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true); setErr(null);
    try {
      const base = apiBase();
      const [eRaw, sRaw, cRaw] = await Promise.all([
        fetch(`${base}/ops/events`,      { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/aip/skill`,       { headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
        fetch(`${base}/entities/Contact`,{ headers: { Authorization: `Bearer ${API_KEY}` } }).then(r => r.json()),
      ]);
      const ev = normOpsEvents(eRaw);
      const sk = normSkills(sRaw);
      const co = normContacts(cRaw);
      setOpsCount(ev.length);
      setSkillCount(sk.length);
      setContactCount(co.length);
      setRows(classify(ev, sk, co));
    } catch (e) {
      setErr(e.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:oasalign-toggle", toggle);
    return () => window.removeEventListener("jarvis:oasalign-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) { clearInterval(timer.current); return; }
    load();
    timer.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer.current);
  }, [open, load]);

  const unaligned = rows.filter(r => r.alignment === "UNALIGNED").length;

  const FILTERS = ["ALL", "FULLY_ALIGNED", "SKILL_ONLY", "CONTACT_ONLY", "UNALIGNED"];

  const visible = rows
    .filter(r => filter === "ALL" || r.alignment === filter)
    .filter(r => !search || `${r.name} ${r.desc}`.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildOasalignScript();
      const base   = apiBase();
      const voice  = getActiveVoice ? getActiveVoice() : "ash";
      await fetch(`${base}/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ text: script, voice }),
      }).then(async r => {
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          new Audio(url).play();
        }
      });
    } catch { /* silent */ }
    setAssessing(false);
  }

  const btnStyle = {
    position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_IDX,
    background: unaligned > 0 ? "rgba(255,179,0,0.12)" : "rgba(0,229,255,0.07)",
    border: `1px solid ${unaligned > 0 ? AM : CY}44`,
    color: unaligned > 0 ? AM : CY,
    fontFamily: MN, fontSize: 9, letterSpacing: 1.5, padding: "4px 8px",
    cursor: "pointer", borderRadius: 3,
  };

  const panelStyle = {
    position: "fixed", bottom: 36, left: BTN_LEFT - 360, width: 580, maxHeight: "70vh",
    overflowY: "auto", background: BG, border: `1px solid ${AM}44`,
    borderRadius: 6, zIndex: Z_IDX + 1, fontFamily: MN, fontSize: 11,
    color: "rgba(255,255,255,0.85)", padding: 16,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(v => !v)}>
        ◈ OASALIGN
        {unaligned > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#000",
            borderRadius: 9, padding: "1px 5px", fontSize: 8,
            animation: "oasalign-pulse 1.4s infinite",
          }}>{unaligned}</span>
        )}
      </button>

      {open && (
        <div style={panelStyle}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: AM, letterSpacing: 2, fontSize: 10 }}>
              ◈ OPS × SKILL × CONTACT RESPONSE ALIGNMENT
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 14 }}>
              ×
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
            {[
              ["OPS EVENTS", opsCount,     CY],
              ["AIP SKILLS", skillCount,   "#9C27B0"],
              ["CONTACTS",   contactCount, OR],
              ["UNALIGNED",  unaligned,    AM],
            ].map(([label, val, col]) => (
              <div key={label} style={{ background: DIM, border: `1px solid ${col}22`, borderRadius: 4, padding: "6px 8px", textAlign: "center" }}>
                <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `${statusColour(f === "ALL" ? "FULLY_ALIGNED" : f)}22` : "transparent",
                  border: `1px solid ${filter === f ? statusColour(f === "ALL" ? "FULLY_ALIGNED" : f) : "rgba(255,255,255,0.12)"}`,
                  color: filter === f ? statusColour(f === "ALL" ? "FULLY_ALIGNED" : f) : "rgba(255,255,255,0.5)",
                  fontFamily: MN, fontSize: 8, padding: "3px 7px", borderRadius: 3, cursor: "pointer",
                  letterSpacing: 1,
                }}>
                {f.replace(/_/g, " ")}
              </button>
            ))}
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto", background: DIM, border: "1px solid rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.7)", fontFamily: MN, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 120,
              }}
            />
          </div>

          {/* rows */}
          {loading && <div style={{ color: CY, fontSize: 9, letterSpacing: 1, padding: "8px 0" }}>◌ LOADING…</div>}
          {err && <div style={{ color: RD, fontSize: 9, padding: "8px 0" }}>⚠ {err}</div>}
          {!loading && visible.map(row => {
            const hasDetail = row.matchedSkills.length > 0 || row.matchedContacts.length > 0;
            const col = statusColour(row.alignment);
            return (
              <div key={row.id} style={{
                background: DIM, borderRadius: 4,
                border: `1px solid ${col}33`,
                marginBottom: 4, padding: "7px 10px",
                cursor: hasDetail ? "pointer" : "default",
              }} onClick={() => hasDetail && setExpanded(expanded === row.id ? null : row.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    color: col, fontSize: 7, letterSpacing: 1,
                    border: `1px solid ${col}44`, padding: "1px 4px", borderRadius: 2,
                    minWidth: 88, textAlign: "center",
                  }}>{row.alignment.replace(/_/g, " ")}</span>
                  <span style={{ color: "rgba(255,255,255,0.85)", flex: 1, fontSize: 10 }}>{row.name}</span>
                  {row.type && <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 8 }}>{row.type}</span>}
                  {hasDetail && (
                    <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>
                      {expanded === row.id ? "▲" : "▼"}
                    </span>
                  )}
                </div>

                {/* expanded matches */}
                {expanded === row.id && (
                  <div style={{ marginTop: 6, marginLeft: 96 }}>
                    {/* skill matches */}
                    {row.matchedSkills.map(s => (
                      <div key={s.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(0,229,255,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${CY}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: CY, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${CY}44`, padding: "1px 4px", borderRadius: 2,
                          }}>SKILL</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{s.name}</span>
                          {s.type && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 7 }}>{s.type}</span>}
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(s.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${CY}88 ${Math.round(s.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                    {/* contact matches */}
                    {row.matchedContacts.map(c => (
                      <div key={c.id} style={{
                        marginBottom: 4, padding: "5px 8px",
                        background: "rgba(255,152,0,0.05)", borderRadius: 3,
                        borderLeft: `2px solid ${OR}`,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{
                            color: OR, fontSize: 7, letterSpacing: 1,
                            border: `1px solid ${OR}44`, padding: "1px 4px", borderRadius: 2,
                          }}>CONTACT</span>
                          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, flex: 1 }}>{c.name}</span>
                          {c.role && <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 7 }}>{c.role}</span>}
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8 }}>{Math.round(c.score * 100)}%</span>
                        </div>
                        <div style={{
                          height: 2, marginTop: 4,
                          background: `linear-gradient(to right, ${OR}88 ${Math.round(c.score * 100)}%, rgba(255,255,255,0.06) 0)`,
                          borderRadius: 1,
                        }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              marginTop: 10, width: "100%", background: `${AM}18`,
              border: `1px solid ${AM}44`, color: AM, fontFamily: MN, fontSize: 9,
              letterSpacing: 1.5, padding: "6px 0", borderRadius: 3, cursor: "pointer",
            }}>
            {assessing ? "◌ ASSESSING…" : "▶ ASSESS RESPONSE ALIGNMENT"}
          </button>
        </div>
      )}

      <style>{`
        @keyframes oasalign-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
      `}</style>
    </>
  );
}
