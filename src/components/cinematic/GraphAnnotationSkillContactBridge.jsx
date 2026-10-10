import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_073_400;
const Z_INDEX  = 295;
const POLL_MS  = 90_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const CY = "#00CFFF";
const AM = "#F59E0B";
const GN = "#22C55E";
const PU = "#A855F7";
const RD = "#EF4444";
const BG = "rgba(6,11,22,0.97)";
const FONT = "'JetBrains Mono',monospace";

export const GACCOV_RE = /\b(gaccov|annotation coverage|annotation skill|annotation contact|uncharted annotation|annotation intelligence bridge|graph annotation coverage|annotation bridge)\b/i;
export function isGaccovQuery(q = "") { return GACCOV_RE.test(q); }

function keywords(s = "") {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}
function scoreText(haystack = "", kws = []) {
  const h = haystack.toLowerCase();
  let hits = 0;
  for (const w of kws) if (h.includes(w)) hits++;
  return kws.length ? hits / kws.length : 0;
}
function extractAnnotation(a) {
  return [a.label, a.text, a.note, a.description, a.content, a.tag, a.type]
    .filter(Boolean).join(" ");
}
function extractSkill(s) {
  return [s.name, s.description, s.type, s.tags?.join?.(" "), s.category]
    .filter(Boolean).join(" ");
}
function extractContact(c) {
  return [c.name, c.role, c.organisation, c.department, c.tags?.join?.(" "), c.bio]
    .filter(Boolean).join(" ");
}
function classify(ann, skills, contacts) {
  const kws = keywords(extractAnnotation(ann));
  let skillScore = 0, contactScore = 0;
  let bestSkill = null, bestContact = null;
  for (const s of skills) {
    const sc = scoreText(extractSkill(s), kws);
    if (sc > skillScore) { skillScore = sc; bestSkill = s; }
  }
  for (const c of contacts) {
    const sc = scoreText(extractContact(c), kws);
    if (sc > contactScore) { contactScore = sc; bestContact = c; }
  }
  const hasSkill = skillScore >= 0.12;
  const hasContact = contactScore >= 0.12;
  let _cls;
  if (hasSkill && hasContact) _cls = "FULLY_COVERED";
  else if (hasSkill) _cls = "SKILL_ONLY";
  else if (hasContact) _cls = "CONTACT_LINKED";
  else _cls = "UNCHARTED";
  return { ...ann, _cls, _skillScore: skillScore, _contactScore: contactScore, _bestSkill: bestSkill, _bestContact: bestContact };
}

export async function buildGaccovScript() {
  try {
    const base = apiBase();
    const [annRes, skillRes, contactRes] = await Promise.all([
      fetch(`${base}/v1/graph/annotations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/aip/skill`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Contact`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [annData, skillData, contactData] = await Promise.all([
      annRes.ok ? annRes.json() : [],
      skillRes.ok ? skillRes.json() : [],
      contactRes.ok ? contactRes.json() : [],
    ]);
    const anns     = (Array.isArray(annData)     ? annData     : annData?.items     ?? annData?.results     ?? []);
    const skills   = (Array.isArray(skillData)   ? skillData   : skillData?.items   ?? skillData?.results   ?? []);
    const contacts = (Array.isArray(contactData) ? contactData : contactData?.items ?? contactData?.results ?? []);
    const classified = anns.map(a => classify(a, skills, contacts));
    const total     = classified.length;
    const covered   = classified.filter(x => x._cls === "FULLY_COVERED").length;
    const skillOnly = classified.filter(x => x._cls === "SKILL_ONLY").length;
    const ctLinked  = classified.filter(x => x._cls === "CONTACT_LINKED").length;
    const uncharted = classified.filter(x => x._cls === "UNCHARTED").length;
    const pct = total ? Math.round((covered / total) * 100) : 0;
    return `Graph Annotation Intelligence Bridge online, sir. ${total} annotations cross-referenced against ${skills.length} AI skills and ${contacts.length} contacts. ` +
      `${covered} fully covered (${pct}%), ${skillOnly} skill-only, ${ctLinked} contact-linked, ${uncharted} uncharted with zero coverage. ` +
      (uncharted > 0 ? `${uncharted} annotations are operationally dark — no skill or contact assigned. Immediate coverage assignment recommended, sir.` : `All annotations have coverage. System is fully mapped, sir.`);
  } catch {
    return "Graph Annotation Intelligence Bridge standing by, sir. Cross-referencing graph annotations against AIP skills and contacts to surface uncharted annotation coverage gaps.";
  }
}

const CLS_COLOR = { FULLY_COVERED: GN, SKILL_ONLY: CY, CONTACT_LINKED: PU, UNCHARTED: AM };
const CLS_LABEL = { FULLY_COVERED: "FULLY COVERED", SKILL_ONLY: "SKILL ONLY", CONTACT_LINKED: "CONTACT LINKED", UNCHARTED: "UNCHARTED" };
const TABS = ["ALL", "FULLY_COVERED", "SKILL_ONLY", "CONTACT_LINKED", "UNCHARTED"];

export default function GraphAnnotationSkillContactBridge() {
  const [open, setOpen]             = useState(false);
  const [anns, setAnns]             = useState([]);
  const [skills, setSkills]         = useState([]);
  const [contacts, setContacts]     = useState([]);
  const [classified, setClassified] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState("");
  const [tab, setTab]               = useState("ALL");
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr("");
    try {
      const base = apiBase();
      const [annRes, skillRes, contactRes] = await Promise.all([
        fetch(`${base}/v1/graph/annotations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/aip/skill`,          { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Contact`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [annData, skillData, contactData] = await Promise.all([
        annRes.ok ? annRes.json() : [],
        skillRes.ok ? skillRes.json() : [],
        contactRes.ok ? contactRes.json() : [],
      ]);
      const a = Array.isArray(annData)     ? annData     : annData?.items     ?? annData?.results     ?? [];
      const s = Array.isArray(skillData)   ? skillData   : skillData?.items   ?? skillData?.results   ?? [];
      const c = Array.isArray(contactData) ? contactData : contactData?.items ?? contactData?.results ?? [];
      setAnns(a); setSkills(s); setContacts(c);
      setClassified(a.map(x => classify(x, s, c)));
    } catch (e) {
      setErr(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:gaccov-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gaccov-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const total     = classified.length;
  const covered   = classified.filter(x => x._cls === "FULLY_COVERED").length;
  const skillOnly = classified.filter(x => x._cls === "SKILL_ONLY").length;
  const ctLinked  = classified.filter(x => x._cls === "CONTACT_LINKED").length;
  const uncharted = classified.filter(x => x._cls === "UNCHARTED").length;
  const pct       = total ? Math.round((covered / total) * 100) : 0;

  const visible = classified.filter(x => {
    if (tab !== "ALL" && x._cls !== tab) return false;
    if (search) {
      const lc = search.toLowerCase();
      return extractAnnotation(x).toLowerCase().includes(lc);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const ctx = `Graph Annotation Intelligence Bridge: ${total} annotations, ${covered} fully covered, ${skillOnly} skill-only, ${ctLinked} contact-linked, ${uncharted} uncharted. ` +
        `AIP skills: ${skills.length}. Contacts: ${contacts.length}. Coverage: ${pct}%.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Assess graph annotation intelligence coverage: ${ctx}` }),
      });
      const d = await r.json();
      const answer = (d.answer || "Assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
      try {
        await fetch(`${apiBase()}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: answer }),
        }).then(async res => {
          if (!res.ok) return;
          const url = URL.createObjectURL(await res.blob());
          const a = new Audio(url);
          a.onended = () => URL.revokeObjectURL(url);
          a.play().catch(() => {});
        });
      } catch {}
    } catch {}
    setAssessing(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Annotation × AIP Skill × Contact Intelligence Bridge (GACCOV)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: Z_INDEX,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${CY}55`,
          color: CY, fontFamily: FONT, fontSize: 9, letterSpacing: 1,
          padding: "3px 7px", borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ GACCOV{uncharted > 0 && <span style={{ marginLeft: 4, background: AM, color: "#000", borderRadius: 2, padding: "0 3px", fontSize: 8 }}>{uncharted}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z_INDEX, background: BG,
      fontFamily: FONT, display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${CY}33`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ color: CY, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>◈ GACCOV</span>
        <span style={{ color: "#8899AA", fontSize: 10, letterSpacing: 1 }}>GRAPH ANNOTATION × AIP SKILL × CONTACT INTELLIGENCE BRIDGE</span>
        <span style={{ marginLeft: "auto", color: "#445566", fontSize: 9 }}>
          {loading ? "↻ LOADING…" : `↻ ${POLL_MS / 1000}s`}
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: RD, cursor: "pointer", fontSize: 14, marginLeft: 6 }}>✕</button>
      </div>

      {err && <div style={{ padding: "6px 16px", color: RD, fontSize: 10 }}>⚠ {err}</div>}

      {/* Stats */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexShrink: 0, flexWrap: "wrap" }}>
        {[
          ["ANNOTATIONS", total, CY],
          ["AIP SKILLS",  skills.length, CY],
          ["CONTACTS",    contacts.length, CY],
          ["FULLY COVERED", covered, GN],
          ["SKILL ONLY",  skillOnly, CY],
          ["CONTACT LINKED", ctLinked, PU],
          ["UNCHARTED",   uncharted, AM],
        ].map(([label, val, col]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${col}33`, borderRadius: 4, padding: "6px 12px", minWidth: 90 }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#667788", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <div style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${GN}33`, borderRadius: 4, padding: "6px 12px", minWidth: 90 }}>
          <div style={{ color: GN, fontSize: 16, fontWeight: 700 }}>{pct}%</div>
          <div style={{ color: "#667788", fontSize: 8, letterSpacing: 1 }}>COVERAGE</div>
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ margin: "0 16px 8px", height: 6, background: "#111827", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg,${GN},${CY})`, transition: "width 0.6s" }} />
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "4px 16px 6px", flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CLS_COLOR[t] || CY}22` : "transparent",
            border: `1px solid ${tab === t ? (CLS_COLOR[t] || CY) : "#334455"}`,
            color: tab === t ? (CLS_COLOR[t] || CY) : "#556677",
            fontFamily: FONT, fontSize: 8, letterSpacing: 1, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search annotations…"
          style={{ marginLeft: "auto", background: "#0a0f18", border: `1px solid ${CY}33`, color: CY, fontFamily: FONT, fontSize: 9, padding: "3px 8px", borderRadius: 3, width: 180 }}
        />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 8px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: "#556677", fontSize: 10, padding: "20px 0", textAlign: "center" }}>No annotations match filter.</div>
        )}
        {visible.map((ann, i) => {
          const col = CLS_COLOR[ann._cls] || CY;
          const isExp = expanded === i;
          const label = extractAnnotation(ann) || ann.id || `Annotation ${i + 1}`;
          return (
            <div key={ann.id ?? i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                marginBottom: 4, padding: "7px 10px", borderRadius: 4, cursor: "pointer",
                background: isExp ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isExp ? col : "#1a2535"}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: col, fontSize: 9, letterSpacing: 1, minWidth: 96 }}>{CLS_LABEL[ann._cls]}</span>
                <span style={{ color: "#AABBCC", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {label.slice(0, 80)}
                </span>
                <span style={{ color: "#445566", fontSize: 9 }}>
                  S:{Math.round(ann._skillScore * 100)}% C:{Math.round(ann._contactScore * 100)}%
                </span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${col}22` }}>
                  {ann._bestSkill && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ color: CY, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>▸ MATCHED SKILL</div>
                      <div style={{ background: "#0a0f18", border: `1px solid ${CY}33`, borderRadius: 3, padding: "5px 8px" }}>
                        <div style={{ color: CY, fontSize: 10 }}>{ann._bestSkill.name || ann._bestSkill.id}</div>
                        <div style={{ color: "#667788", fontSize: 9 }}>{ann._bestSkill.type || ann._bestSkill.category || ""}</div>
                        <div style={{ marginTop: 4, height: 3, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round(ann._skillScore * 100)}%`, background: CY }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {ann._bestContact && (
                    <div>
                      <div style={{ color: PU, fontSize: 9, letterSpacing: 1, marginBottom: 3 }}>▸ MATCHED CONTACT</div>
                      <div style={{ background: "#0a0f18", border: `1px solid ${PU}33`, borderRadius: 3, padding: "5px 8px" }}>
                        <div style={{ color: PU, fontSize: 10 }}>{ann._bestContact.name || ann._bestContact.id}</div>
                        <div style={{ color: "#667788", fontSize: 9 }}>{[ann._bestContact.role, ann._bestContact.organisation].filter(Boolean).join(" · ")}</div>
                        <div style={{ marginTop: 4, height: 3, background: "#111827", borderRadius: 2, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.round(ann._contactScore * 100)}%`, background: PU }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {!ann._bestSkill && !ann._bestContact && (
                    <div style={{ color: AM, fontSize: 9 }}>⚠ No skill or contact matched. Annotation is operationally uncharted.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${CY}22`, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button
          onClick={assess} disabled={assessing || loading}
          style={{
            background: assessing ? "#0a0f18" : `${CY}22`, border: `1px solid ${CY}`,
            color: CY, fontFamily: FONT, fontSize: 9, letterSpacing: 1,
            padding: "4px 12px", borderRadius: 3, cursor: assessing ? "wait" : "pointer",
          }}
        >
          {assessing ? "◍ ASSESSING…" : "▶ ASSESS COVERAGE"}
        </button>
        <span style={{ color: "#334455", fontSize: 9, marginLeft: "auto" }}>
          {visible.length}/{total} shown
        </span>
      </div>
    </div>
  );
}
