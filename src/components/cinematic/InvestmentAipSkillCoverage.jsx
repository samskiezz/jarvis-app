/**
 * InvestmentAipSkillCoverage — F83 (IASC)
 *
 * Parallel-fetches /entities/Investment + /v1/aip/skill every 90 s.
 * Keyword-correlates each skill (name/description/tags/category) against
 * investments (name/sector/notes/tags).
 * Classification: EXERCISED (≥1 investment match) vs DORMANT (0 matches).
 * Amber badge on dormant count.
 *
 * Voice intents: "investment skill / skill investment / iasc /
 *                exercised skills / dormant skills / portfolio skills /
 *                skill investment coverage / aip investment / investment aip"
 * Strip button: ◈ IASC  left:2460 bottom:18 zIndex:68
 * Custom event: jarvis:iasc-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AMB  = "#FFD700";
const GRN  = "#00E5A0";
const DIM  = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const IASC_RE =
  /\b(investment.skill|skill.investment|iasc|exercised.skill|dormant.skill|portfolio.skill|skill.investment.coverage|aip.investment|investment.aip|which.skills.cover.invest|skill.portfolio|aip.portfolio)\b/i;

export function isIascQuery(t) { return IASC_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(skill, investment) {
  const a = tokenize([
    skill.name, skill.description,
    (skill.tags || []).join(" "), skill.category || "",
  ].join(" "));
  const b = tokenize([
    investment.name, investment.sector,
    investment.notes, (investment.tags || []).join(" "),
  ].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  return hits / Math.max(a.length, 1);
}

async function fetchAll() {
  const base = apiBase();
  const [sr, ir] = await Promise.all([
    fetch(`${base}/v1/aip/skill`,        { headers: hdrs }),
    fetch(`${base}/entities/Investment`, { headers: hdrs }),
  ]);
  const sd = sr.ok ? await sr.json() : {};
  const id_ = ir.ok ? await ir.json() : {};

  const skills = (Array.isArray(sd) ? sd : sd?.data || sd?.items || sd?.results || sd?.skills || []).map(s => ({
    id:          s.id || s._id || String(Math.random()),
    name:        s.name || s.skill_name || "Unnamed Skill",
    description: s.description || s.desc || "",
    category:    s.category || s.type || "",
    tags:        s.tags || [],
    enabled:     s.enabled !== false,
  }));

  const investments = (Array.isArray(id_) ? id_ : id_?.data || id_?.items || id_?.results || id_?.investments || []).map(inv => ({
    id:     inv.id || inv._id || String(Math.random()),
    name:   inv.name || inv.title || inv.asset || "Unnamed Investment",
    sector: inv.sector || inv.type || inv.category || "",
    notes:  inv.notes || inv.description || inv.summary || "",
    tags:   inv.tags || [],
  }));

  return { skills, investments };
}

export async function buildIascScript() {
  try {
    const base = apiBase();
    const { skills, investments } = await fetchAll();
    const threshold = 0.04;
    const exercised = skills.filter(s => investments.some(inv => relevance(s, inv) >= threshold));
    const dormant   = skills.filter(s => !investments.some(inv => relevance(s, inv) >= threshold));
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...hdrs },
      body: JSON.stringify({
        message: `Investment × AIP Skill Coverage (IASC): ${skills.length} skills, ` +
          `${investments.length} investments, ${exercised.length} skills exercised (matched ≥1 investment), ` +
          `${dormant.length} dormant. Dormant skills: ` +
          `${dormant.slice(0, 3).map(s => s.name).join("; ") || "none"}. ` +
          "Assess which JARVIS skills are relevant to the investment portfolio in exactly 2 sentences.",
      }),
    });
    const d = r.ok ? await r.json() : null;
    return d?.response || d?.reply || d?.content || d?.text ||
      `IASC: ${exercised.length}/${skills.length} skills exercised against investments, ${dormant.length} dormant.`;
  } catch {
    return "IASC: unable to fetch assessment.";
  }
}

/* ── Styles ─────────────────────────────────────────────────────── */
const PANEL = {
  position: "fixed",
  bottom: 48,
  left: 2460,
  width: 440,
  height: 520,
  background: "rgba(7,18,28,0.97)",
  border: "1px solid #29E7FF44",
  borderRadius: 10,
  boxShadow: "0 0 28px #29E7FF22",
  display: "flex",
  flexDirection: "column",
  zIndex: 68,
  fontFamily: "'Share Tech Mono','Courier New',monospace",
  color: "#DCEBF5",
  backdropFilter: "blur(14px)",
};

const BTN = {
  position: "fixed",
  left: 2460,
  bottom: 18,
  zIndex: 68,
  background: "rgba(7,18,28,0.88)",
  border: "1px solid #29E7FF55",
  borderRadius: 6,
  color: CY,
  fontFamily: "'Share Tech Mono',monospace",
  fontSize: 11,
  padding: "3px 8px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 5,
};

/* ── Component ─────────────────────────────────────────────────── */
export default function InvestmentAipSkillCoverage() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assess,    setAssess]    = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const { skills, investments } = await fetchAll();
      const threshold = 0.04;
      const enriched = skills.map(s => {
        const matches = investments
          .map(inv => ({ ...inv, score: relevance(s, inv) }))
          .filter(inv => inv.score >= threshold)
          .sort((x, y) => y.score - x.score);
        return { ...s, status: matches.length > 0 ? "EXERCISED" : "DORMANT", matches };
      });
      enriched.sort((a, b) => (a.status === "DORMANT" ? -1 : 1) - (b.status === "DORMANT" ? -1 : 1));
      setData({ skills: enriched, investments });
    } catch (e) {
      setErr(e.message || "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => !o); };
    window.addEventListener("jarvis:iasc-toggle", toggle);
    return () => window.removeEventListener("jarvis:iasc-toggle", toggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  const runAssess = async () => {
    setAssessing(true); setAssess("");
    const txt = await buildIascScript();
    setAssess(txt); setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
  };

  if (!open) {
    const dormantCount = data ? data.skills.filter(s => s.status === "DORMANT").length : 0;
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Investment × AIP Skill Coverage">
        ◈ IASC
        {dormantCount > 0 && (
          <span style={{ background: AMB, color: "#000", borderRadius: 3, fontSize: 9, padding: "1px 4px", fontWeight: 700 }}>
            {dormantCount}
          </span>
        )}
      </button>
    );
  }

  const skills      = data?.skills      || [];
  const investments = data?.investments || [];
  const exercised   = skills.filter(s => s.status === "EXERCISED");
  const dormant     = skills.filter(s => s.status === "DORMANT");

  const visible = skills.filter(s => {
    if (filter === "EXERCISED" && s.status !== "EXERCISED") return false;
    if (filter === "DORMANT"   && s.status !== "DORMANT")   return false;
    const q = search.toLowerCase();
    if (!q) return true;
    return (s.name + s.description + s.category).toLowerCase().includes(q);
  });

  const toggle = id => setExpanded(e => ({ ...e, [id]: !e[id] }));

  return (
    <div style={PANEL}>
      {/* Header */}
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid #29E7FF22", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: CY, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>◈ INVESTMENT × AIP SKILL</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 14px", borderBottom: "1px solid #29E7FF11" }}>
        {[
          { label: "SKILLS",    val: skills.length,      color: CY },
          { label: "INVEST",    val: investments.length, color: CY },
          { label: "EXERCISED", val: exercised.length,   color: GRN },
          { label: "DORMANT",   val: dormant.length,     color: AMB },
        ].map(t => (
          <div key={t.label} style={{ flex: 1, background: "rgba(41,231,255,0.04)", borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
            <div style={{ color: t.color, fontSize: 14, fontWeight: 700 }}>{t.val}</div>
            <div style={{ color: DIM, fontSize: 8, letterSpacing: 0.5 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "6px 14px 4px", flexWrap: "wrap" }}>
        {["ALL", "EXERCISED", "DORMANT"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{ background: filter === f ? CY : "rgba(41,231,255,0.08)", color: filter === f ? "#000" : DIM, border: "none", borderRadius: 4, padding: "2px 8px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
            {f}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search skills…"
          style={{ marginLeft: "auto", background: "rgba(41,231,255,0.05)", border: "1px solid #29E7FF22", borderRadius: 4, color: "#DCEBF5", fontFamily: "inherit", fontSize: 10, padding: "2px 8px", width: 120 }} />
      </div>

      {/* Skill list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 14px" }}>
        {loading && !data && <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>loading…</div>}
        {err && <div style={{ color: "#FF4D6D", fontSize: 11, textAlign: "center", marginTop: 10 }}>{err}</div>}
        {visible.map(s => (
          <div key={s.id} style={{ marginBottom: 6, background: "rgba(41,231,255,0.03)", borderRadius: 6, border: "1px solid #29E7FF18" }}>
            <div onClick={() => toggle(s.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", cursor: "pointer" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: s.status === "EXERCISED" ? GRN : AMB, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.name}
              </span>
              {s.category && <span style={{ fontSize: 9, color: DIM }}>{s.category}</span>}
              <span style={{ fontSize: 9, color: s.status === "EXERCISED" ? GRN : AMB, marginLeft: "auto" }}>
                {s.status}
              </span>
              <span style={{ color: DIM, fontSize: 10 }}>{expanded[s.id] ? "▲" : "▼"}</span>
            </div>

            {expanded[s.id] && (
              <div style={{ padding: "4px 12px 8px", borderTop: "1px solid #29E7FF11" }}>
                {s.description && <div style={{ fontSize: 9, color: DIM, marginBottom: 4, lineHeight: 1.4 }}>{s.description.slice(0, 120)}</div>}
                {s.matches.length === 0 ? (
                  <div style={{ fontSize: 10, color: DIM, fontStyle: "italic" }}>No investments matched this skill.</div>
                ) : (
                  s.matches.slice(0, 5).map((inv, i) => (
                    <div key={inv.id + i} style={{ marginBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.name}</span>
                        {inv.sector && <span style={{ fontSize: 8, color: CY, background: "rgba(41,231,255,0.12)", borderRadius: 3, padding: "1px 4px" }}>{inv.sector.toUpperCase()}</span>}
                        <span style={{ fontSize: 9, color: GRN }}>{(inv.score * 100).toFixed(0)}%</span>
                      </div>
                      <div style={{ height: 2, background: "#1a2a3a", borderRadius: 1, marginTop: 2 }}>
                        <div style={{ height: 2, width: `${Math.min(100, inv.score * 400)}%`, background: GRN, borderRadius: 1 }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
        {!loading && visible.length === 0 && data && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", marginTop: 20 }}>No skills match.</div>
        )}
      </div>

      {/* Assess footer */}
      <div style={{ padding: "6px 14px 10px", borderTop: "1px solid #29E7FF22" }}>
        {assess && <div style={{ fontSize: 10, color: "#DCEBF5", marginBottom: 5, lineHeight: 1.4 }}>{assess}</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={runAssess} disabled={assessing}
            style={{ flex: 1, background: "rgba(41,231,255,0.10)", border: "1px solid #29E7FF44", borderRadius: 5, color: CY, fontFamily: "inherit", fontSize: 10, padding: "4px 0", cursor: assessing ? "default" : "pointer" }}>
            {assessing ? "assessing…" : "▶ ASSESS"}
          </button>
          <button onClick={load}
            style={{ background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33", borderRadius: 5, color: DIM, fontFamily: "inherit", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}>
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}
