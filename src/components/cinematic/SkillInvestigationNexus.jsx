/**
 * SkillInvestigationNexus — F499
 * "JARVIS, skill investigation / which investigations have skills /
 *  skillinv / investigation skill coverage / skilled cases /
 *  unskilled investigation / skill case link"
 * Cross-references /v1/aip/skill + /v1/investigations.
 * Keyword-matches skill names/domains against investigation titles/summaries.
 * SKILL-BACKED (≥1 matching skill) vs UNSKILLED (no skill coverage).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFD700";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 25540;

const SKILLINV_RE =
  /\bskillinv\b|\bskill.?invest\b|\binvest.?skill\b|\bskill.?case\b|\bcase.?skill\b|\bwhich.?invest.?have.?skill\b|\bunskilled.?invest\b|\bunskilled.?case\b|\bskill.?case.?link\b|\bskill.?coverage.?invest\b|\binvest.?skill.?coverage\b/i;

export function isSkillinvQuery(text) {
  return SKILLINV_RE.test(text || "");
}

function normaliseSkills(data) {
  if (!data) return [];
  const raw =
    data.skills || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:     s.id || s.skill_id || `sk-${i}`,
    name:   (s.name || s.title || s.skill_name || `Skill ${i + 1}`).trim(),
    domain: s.domain || s.category || s.kind || null,
    score:  Number(s.score || s.performance || s.rating || 0),
    tags: [
      ...(s.tags || []),
      s.domain, s.category, s.kind, s.area,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseInvestigations(data) {
  if (!data) return [];
  const raw =
    data.investigations || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((inv, i) => ({
    id:      inv.id || `inv-${i}`,
    title:   (inv.title || inv.name || inv.label || `Investigation ${i + 1}`).trim(),
    status:  (inv.status || inv.state || "UNKNOWN").toUpperCase(),
    lead:    inv.lead || inv.assigned_to || inv.owner || null,
    summary: inv.summary || inv.description || inv.notes || null,
    tags: [
      ...(inv.tags || []),
      inv.kind, inv.type, inv.category, inv.domain,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function keywords(item) {
  const text = [item.name, item.title, item.domain, item.summary, ...(item.tags || [])]
    .filter(Boolean).join(" ").toLowerCase();
  return text.split(/\W+/).filter(w => w.length > 3);
}

function crossRef(skills, investigations) {
  return investigations.map(inv => {
    const invWords = new Set(keywords(inv));
    const matches = skills.filter(sk =>
      keywords(sk).some(w => invWords.has(w))
    );
    return { ...inv, matches, covered: matches.length > 0 };
  });
}

export async function buildSkillinvScript() {
  let skillData = null;
  let invData   = null;
  try {
    const [sr, ir] = await Promise.all([
      fetch(`${apiBase()}/v1/aip/skill`,       { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/investigations`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (sr.ok) skillData = await sr.json();
    if (ir.ok) invData   = await ir.json();
  } catch (_) {}

  const skills    = normaliseSkills(skillData);
  const invs      = normaliseInvestigations(invData);
  const linked    = crossRef(skills, invs);
  const backed    = linked.filter(i => i.covered);
  const unskilled = linked.filter(i => !i.covered);
  const pct       = invs.length ? Math.round((backed.length / invs.length) * 100) : 0;

  if (!invs.length)
    return "No investigations found to assess skill coverage, sir.";

  const parts = [
    `Skill-Investigation Nexus: ${skills.length} skill${skills.length !== 1 ? "s" : ""} assessed against ${invs.length} investigation${invs.length !== 1 ? "s" : ""}.`,
    `Coverage: ${pct}% — ${backed.length} skill-backed, ${unskilled.length} unskilled case${unskilled.length !== 1 ? "s" : ""}.`,
  ];
  if (unskilled.length) {
    parts.push(`Top unskilled: ${unskilled.slice(0, 3).map(i => i.title).join(", ")}.`);
  }
  return parts.join(" ");
}

export default function SkillInvestigationNexus() {
  const [open,       setOpen]       = useState(false);
  const [skills,     setSkills]     = useState([]);
  const [linked,     setLinked]     = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [loading,    setLoading]    = useState(false);
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [brief,      setBrief]      = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, ir] = await Promise.all([
        fetch(`${apiBase()}/v1/aip/skill`,     { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/investigations`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const sd = sr.ok ? await sr.json() : null;
      const id = ir.ok ? await ir.json() : null;
      const sk = normaliseSkills(sd);
      const iv = normaliseInvestigations(id);
      setSkills(sk);
      setLinked(crossRef(sk, iv));
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) { load(); }
  }, [open, load]);

  useEffect(() => {
    const poll = setInterval(() => { if (open) load(); }, POLL_MS);
    return () => clearInterval(poll);
  }, [open, load]);

  useEffect(() => {
    const toggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:skillinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:skillinv-toggle", toggle);
  }, []);

  const backed    = linked.filter(i => i.covered);
  const unskilled = linked.filter(i => !i.covered);
  const pct       = linked.length ? Math.round((backed.length / linked.length) * 100) : 0;

  const visible = linked
    .filter(i => {
      if (tab === "BACKED")    return i.covered;
      if (tab === "UNSKILLED") return !i.covered;
      return true;
    })
    .filter(i => !search || i.title.toLowerCase().includes(search.toLowerCase()));

  async function assess() {
    if (assessing) return;
    setAssessing(true); setBrief("");
    try {
      const prompt = `Skill-Investigation coverage: ${skills.length} skills, ${backed.length} backed, ${unskilled.length} unskilled. Top unskilled: ${unskilled.slice(0,3).map(i=>i.title).join(", ")}. Provide a 2-sentence operational brief.`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const d = r.ok ? await r.json() : null;
      const text = d?.response || d?.reply || d?.message || d?.content || "";
      setBrief(text);
      if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {}
    setAssessing(false);
  }

  const statusColor = s => {
    if (s === "OPEN")      return CY;
    if (s === "ACTIVE")    return GRN;
    if (s === "ESCALATED") return RED;
    return DIM;
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 88,
          background: "#0a1628", border: `1px solid ${unskilled.length ? AMB : CY}`,
          color: unskilled.length ? AMB : CY, fontSize: 10, fontFamily: "monospace",
          padding: "3px 7px", cursor: "pointer", borderRadius: 3,
          boxShadow: `0 0 6px ${unskilled.length ? AMB : CY}44`,
        }}
      >
        ◈ SKILLINV{unskilled.length > 0 ? ` [${unskilled.length}]` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 520, maxHeight: "80vh",
      background: "#080f1e", border: `1px solid ${CY}55`, borderRadius: 8,
      zIndex: 1300, display: "flex", flexDirection: "column",
      boxShadow: `0 0 24px ${CY}22`, fontFamily: "monospace",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${CY}33`,
      }}>
        <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
          SKILL × INVESTIGATION NEXUS
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={assess} disabled={assessing} style={{
            background: "none", border: `1px solid ${GRN}`, color: GRN,
            fontSize: 10, cursor: "pointer", padding: "2px 8px", borderRadius: 3,
          }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer",
          }}>✕</button>
        </div>
      </div>

      {/* stats */}
      <div style={{
        display: "flex", gap: 12, padding: "8px 14px", borderBottom: `1px solid ${CY}22`,
        flexWrap: "wrap",
      }}>
        {[
          { label: "SKILLS",    val: skills.length,     col: CY  },
          { label: "BACKED",    val: backed.length,     col: GRN },
          { label: "UNSKILLED", val: unskilled.length,  col: AMB },
          { label: "COVERAGE",  val: `${pct}%`,         col: pct >= 75 ? GRN : pct >= 40 ? AMB : RED },
        ].map(({ label, val, col }) => (
          <div key={label} style={{
            background: "#0c1a2e", border: `1px solid ${col}44`, borderRadius: 4,
            padding: "4px 10px", textAlign: "center",
          }}>
            <div style={{ color: col, fontSize: 14, fontWeight: 700 }}>{val}</div>
            <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "6px 14px", alignItems: "center", flexWrap: "wrap" }}>
        {["ALL", "BACKED", "UNSKILLED"].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? CY : "none",
            color: tab === t ? "#000" : DIM,
            border: `1px solid ${tab === t ? CY : DIM}55`,
            fontSize: 9, cursor: "pointer", padding: "2px 8px", borderRadius: 3,
          }}>{t}</button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="search cases…"
          style={{
            flex: 1, background: "#0c1a2e", border: `1px solid ${CY}33`,
            color: CY, fontSize: 10, padding: "3px 8px", borderRadius: 3,
            outline: "none",
          }}
        />
      </div>

      {/* brief */}
      {brief && (
        <div style={{
          margin: "0 14px 6px", padding: "6px 10px",
          background: "#0c1a2e", border: `1px solid ${GRN}44`,
          color: GRN, fontSize: 10, borderRadius: 4,
        }}>{brief}</div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {loading && (
          <div style={{ color: DIM, fontSize: 10, padding: "12px 14px" }}>Loading…</div>
        )}
        {!loading && visible.length === 0 && (
          <div style={{ color: DIM, fontSize: 10, padding: "12px 14px" }}>No investigations match.</div>
        )}
        {!loading && visible.map(inv => (
          <div key={inv.id}>
            <div
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 14px", cursor: "pointer",
                borderBottom: `1px solid ${CY}11`,
                background: expanded === inv.id ? "#0c1a2e" : "transparent",
              }}
            >
              <span style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 2,
                background: inv.covered ? `${GRN}22` : `${AMB}22`,
                color: inv.covered ? GRN : AMB, border: `1px solid ${inv.covered ? GRN : AMB}55`,
                minWidth: 72, textAlign: "center",
              }}>
                {inv.covered ? "BACKED" : "UNSKILLED"}
              </span>
              <span style={{
                fontSize: 9, padding: "1px 6px", borderRadius: 2,
                border: `1px solid ${statusColor(inv.status)}44`,
                color: statusColor(inv.status),
              }}>{inv.status}</span>
              <span style={{ color: CY, fontSize: 11, flex: 1 }}>{inv.title}</span>
              <span style={{ color: DIM, fontSize: 9 }}>
                {inv.covered ? `${inv.matches.length} skill${inv.matches.length !== 1 ? "s" : ""}` : "—"}
              </span>
            </div>
            {expanded === inv.id && (
              <div style={{
                padding: "8px 20px 10px", background: "#0a1220",
                borderBottom: `1px solid ${CY}22`,
              }}>
                {inv.lead && (
                  <div style={{ color: DIM, fontSize: 9, marginBottom: 4 }}>
                    Lead: <span style={{ color: CY }}>{inv.lead}</span>
                  </div>
                )}
                {inv.summary && (
                  <div style={{ color: "#aab", fontSize: 10, marginBottom: 6 }}>{inv.summary}</div>
                )}
                {inv.covered && inv.matches.length > 0 && (
                  <div>
                    <div style={{ color: GRN, fontSize: 9, marginBottom: 4 }}>Matched Skills:</div>
                    {inv.matches.map(sk => (
                      <div key={sk.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "3px 0", borderBottom: `1px solid ${CY}11`,
                      }}>
                        <span style={{ color: GRN, fontSize: 10, flex: 1 }}>{sk.name}</span>
                        {sk.domain && (
                          <span style={{
                            fontSize: 9, color: DIM,
                            border: `1px solid ${DIM}44`, borderRadius: 2, padding: "1px 5px",
                          }}>{sk.domain}</span>
                        )}
                        {sk.score > 0 && (
                          <span style={{ color: CY, fontSize: 9 }}>{sk.score}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!inv.covered && (
                  <div style={{ color: AMB, fontSize: 9 }}>
                    No skills matched this investigation's domain or keywords.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${CY}22`,
        color: DIM, fontSize: 9, display: "flex", justifyContent: "space-between",
      }}>
        <span>/v1/aip/skill + /v1/investigations</span>
        <span style={{ color: CY }}>{loading ? "refreshing…" : "90 s poll"}</span>
      </div>
    </div>
  );
}
