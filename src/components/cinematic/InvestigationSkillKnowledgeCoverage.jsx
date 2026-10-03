/**
 * F278 — Investigation × AIP Skill × Knowledge Coverage Assessment (IASKACOV)
 *
 * Parallel-fetches /v1/investigations, /v1/aip/skill, /knowledge/;
 * keyword-correlates each investigation against AIP automation skills AND knowledge
 * articles to classify:
 *   FULLY_RESOURCED  — matched by ≥1 AIP skill AND ≥1 knowledge article
 *   SKILL_BACKED     — AIP skill match only
 *   KNOWLEDGE_BACKED — knowledge article match only
 *   UNSUPPORTED      — no match (investigation resource gap)
 *
 * Stat tiles: INVESTIGATIONS / AIP SKILLS / KNOWLEDGE / COV%
 * Class tiles: FULLY RESOURCED / SKILL BACKED / KNOWLEDGE BACKED / UNSUPPORTED
 * Filter tabs: ALL | FULLY_RESOURCED | SKILL_BACKED | KNOWLEDGE_BACKED | UNSUPPORTED
 * Expand any investigation → matched AIP skill cards (cyan) + knowledge cards (green) with relevance bars
 * ▶ ASSESS INVESTIGATION RESOURCES → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ IASKACOV  left:1111840, bottom:8, zIndex:701
 * Voice:   "iaskacov / investigation knowledge skill / investigation resources /
 *           unsupported investigation / investigation coverage / knowledge skill investigation /
 *           investigation capability / investigation resource gap"
 * Event:   jarvis:iaskacov-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 1111840;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const IASKACOV_RE =
  /\b(iaskacov|investigation\s+knowledge\s+skill|investigation\s+resources?|unsupported\s+investigation|investigation\s+coverage|knowledge\s+skill\s+investigation|investigation\s+capability|investigation\s+resource\s+gap)\b/i;

export function isIaskacovQuery(q) { return IASKACOV_RE.test(q); }

export async function buildIaskacovScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [iRes, sRes, kRes] = await Promise.all([
      fetch(`${base}/v1/investigations`, { headers: hdr }),
      fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
      fetch(`${base}/knowledge/`,         { headers: hdr }),
    ]);
    const iRaw = await iRes.json();
    const sRaw = await sRes.json();
    const kRaw = await kRes.json();

    const investigations = normaliseInvestigations(iRaw);
    const skills         = normaliseSkills(sRaw);
    const knowledge      = normaliseKnowledge(kRaw);
    const corr           = buildCorrelated(investigations, skills, knowledge);

    const fully    = corr.filter(c => c.cls === "FULLY_RESOURCED").length;
    const skillOnly = corr.filter(c => c.cls === "SKILL_BACKED").length;
    const knowOnly  = corr.filter(c => c.cls === "KNOWLEDGE_BACKED").length;
    const unsupp    = corr.filter(c => c.cls === "UNSUPPORTED").length;
    const pct       = investigations.length ? Math.round((fully / investigations.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investigation resource coverage assessment (IASKACOV): ${investigations.length} investigations cross-referenced ` +
          `against ${skills.length} AIP automation skills and ${knowledge.length} knowledge articles. ` +
          `FULLY_RESOURCED: ${fully}, SKILL_BACKED: ${skillOnly}, KNOWLEDGE_BACKED: ${knowOnly}, UNSUPPORTED (gap): ${unsupp}. ` +
          `Full resource coverage: ${pct}%. Give a 2-sentence investigation readiness brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "IASKACOV online, sir. Assessing investigation resource coverage across AIP skills and knowledge articles.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseInvestigations(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.investigations) ? raw.investigations
    : [];
  return arr.map(inv => ({
    id:     inv.id || inv._id || String(Math.random()),
    name:   inv.name || inv.title || inv.investigation_name || "Unnamed Investigation",
    status: inv.status || inv.state || "",
    type:   inv.type || inv.investigation_type || "",
    desc:   `${inv.name || ""} ${inv.title || ""} ${inv.description || ""} ${inv.type || ""} ${inv.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseSkills(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.skills) ? raw.skills
    : [];
  return arr.map(s => ({
    id:   s.id || s._id || String(Math.random()),
    name: s.name || s.skill_name || s.title || "Unnamed Skill",
    type: s.type || s.skill_type || "",
    desc: `${s.name || ""} ${s.description || ""} ${s.type || ""} ${s.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function normaliseKnowledge(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items) ? raw.items
    : Array.isArray(raw?.data)  ? raw.data
    : Array.isArray(raw?.articles) ? raw.articles
    : [];
  return arr.map(k => ({
    id:   k.id || k._id || String(Math.random()),
    name: k.name || k.title || k.article_name || "Unnamed Article",
    type: k.type || k.category || "",
    desc: `${k.name || ""} ${k.title || ""} ${k.content || ""} ${k.description || ""} ${k.tags?.join(" ") || ""}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(investigations, skills, knowledge) {
  return investigations.map(inv => {
    const tokens   = tokenize(inv.desc);
    const mSkills  = skills
      .map(s => ({ ...s, rel: relevance(tokens, s.desc) }))
      .filter(s => s.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mKnow    = knowledge
      .map(k => ({ ...k, rel: relevance(tokens, k.desc) }))
      .filter(k => k.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasSk = mSkills.length > 0;
    const hasKn = mKnow.length > 0;
    let cls;
    if (hasSk && hasKn)  cls = "FULLY_RESOURCED";
    else if (hasSk)      cls = "SKILL_BACKED";
    else if (hasKn)      cls = "KNOWLEDGE_BACKED";
    else                 cls = "UNSUPPORTED";
    return { ...inv, cls, mSkills, mKnow };
  });
}

function statusColor(s) {
  const sl = (s || "").toLowerCase();
  if (sl === "open" || sl === "active")   return "#22c55e";
  if (sl === "closed" || sl === "done")   return "#6b7280";
  if (sl === "pending")                   return "#eab308";
  return "#64748b";
}

// ── component ─────────────────────────────────────────────────────────────────
export default function InvestigationSkillKnowledgeCoverage() {
  const [open,           setOpen]           = useState(false);
  const [tab,            setTab]            = useState("ALL");
  const [search,         setSearch]         = useState("");
  const [investigations, setInvestigations] = useState([]);
  const [skills,         setSkills]         = useState([]);
  const [knowledge,      setKnowledge]      = useState([]);
  const [corr,           setCorr]           = useState([]);
  const [expanded,       setExpanded]       = useState(null);
  const [loading,        setLoading]        = useState(false);
  const [assess,         setAssess]         = useState("");
  const [assessing,      setAssessing]      = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [iRes, sRes, kRes] = await Promise.all([
        fetch(`${base}/v1/investigations`, { headers: hdr }),
        fetch(`${base}/v1/aip/skill`,      { headers: hdr }),
        fetch(`${base}/knowledge/`,         { headers: hdr }),
      ]);
      const iRaw = await iRes.json();
      const sRaw = await sRes.json();
      const kRaw = await kRes.json();
      const i = normaliseInvestigations(iRaw);
      const s = normaliseSkills(sRaw);
      const k = normaliseKnowledge(kRaw);
      setInvestigations(i); setSkills(s); setKnowledge(k);
      setCorr(buildCorrelated(i, s, k));
    } catch { /* keep previous data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:iaskacov-toggle", handler);
    return () => window.removeEventListener("jarvis:iaskacov-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildIaskacovScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const fully    = corr.filter(c => c.cls === "FULLY_RESOURCED").length;
  const skillOnly = corr.filter(c => c.cls === "SKILL_BACKED").length;
  const knowOnly  = corr.filter(c => c.cls === "KNOWLEDGE_BACKED").length;
  const unsupp    = corr.filter(c => c.cls === "UNSUPPORTED").length;
  const pct       = investigations.length ? Math.round((fully / investigations.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_RESOURCED", "SKILL_BACKED", "KNOWLEDGE_BACKED", "UNSUPPORTED"];

  const visible = corr.filter(c => {
    const matchTab    = tab === "ALL" || c.cls === tab;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_RESOURCED:  "#22c55e",
    SKILL_BACKED:     "#06b6d4",
    KNOWLEDGE_BACKED: "#10b981",
    UNSUPPORTED:      "#ef4444",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 701,
          background: "rgba(0,0,0,0.7)", border: "1px solid #06b6d4",
          color: "#06b6d4", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ IASKACOV {unsupp > 0 && <span style={{ color: "#ef4444", marginLeft: 4 }}>● {unsupp}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 720, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #06b6d4",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#06b6d4", fontWeight: 700, fontSize: 13 }}>
          ◈ IASKACOV — Investigation × AIP Skill × Knowledge Coverage
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* primary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "INVESTIGATIONS", val: investigations.length, col: "#06b6d4" },
          { label: "AIP SKILLS",     val: skills.length,         col: "#a855f7" },
          { label: "KNOWLEDGE",      val: knowledge.length,      col: "#10b981" },
          { label: "COV%",           val: `${pct}%`,             col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* class stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "0 14px 6px" }}>
        {[
          { label: "FULLY RESOURCED",   val: fully,    col: "#22c55e" },
          { label: "SKILL BACKED",       val: skillOnly, col: "#06b6d4" },
          { label: "KNOWLEDGE BACKED",   val: knowOnly,  col: "#10b981" },
          { label: "UNSUPPORTED",        val: unsupp,    col: "#ef4444" },
        ].map(({ label, val, col }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "4px 8px", textAlign: "center" }}>
            <div style={{ color: col, fontSize: 16, fontWeight: 700 }}>{val}</div>
            <div style={{ color: "#64748b", fontSize: 9 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* coverage bar */}
      <div style={{ margin: "0 14px 8px", background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444", transition: "width 0.5s" }} />
      </div>

      {/* filter tabs + search */}
      <div style={{ padding: "0 14px 6px", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? "#06b6d4" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investigations…"
          style={{
            marginLeft: "auto", background: "rgba(255,255,255,0.06)", border: "1px solid #334155",
            color: "#e2e8f0", borderRadius: 4, padding: "3px 8px", fontSize: 11, width: 180,
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 10px" }}>
        {loading && <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>Loading…</div>}
        {!loading && visible.length === 0 && (
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No investigations match.</div>
        )}
        {visible.map(inv => (
          <div key={inv.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${inv.cls === "UNSUPPORTED" ? "rgba(239,68,68,0.3)" : "transparent"}`,
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{inv.name}</span>
                {inv.status && (
                  <span style={{ background: `${statusColor(inv.status)}22`, color: statusColor(inv.status), borderRadius: 3, padding: "1px 5px", fontSize: 9, marginLeft: 6, fontWeight: 700 }}>
                    {inv.status.toUpperCase()}
                  </span>
                )}
                {inv.type && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{inv.type}</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  background: `${clsColor(inv.cls)}22`, color: clsColor(inv.cls),
                  borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                }}>
                  {inv.cls.replace(/_/g, " ")}
                </span>
                <span style={{ color: "#475569", fontSize: 11 }}>{expanded === inv.id ? "▲" : "▼"}</span>
              </div>
            </div>

            {expanded === inv.id && (
              <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "0 0 6px 6px", padding: "8px 12px", marginTop: 1 }}>
                {/* AIP skills */}
                {inv.mSkills.length > 0 && (
                  <>
                    <div style={{ color: "#06b6d4", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>AIP SKILLS ({inv.mSkills.length})</div>
                    {inv.mSkills.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#67e8f9", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {s.type && <span style={{ background: "#06b6d422", color: "#67e8f9", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{s.type}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${s.rel}%`, height: "100%", background: "#06b6d4", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{s.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {/* knowledge articles */}
                {inv.mKnow.length > 0 && (
                  <>
                    <div style={{ color: "#10b981", fontSize: 10, fontWeight: 700, margin: "8px 0 4px", letterSpacing: 1 }}>KNOWLEDGE ({inv.mKnow.length})</div>
                    {inv.mKnow.map(k => (
                      <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#6ee7b7", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.name}</span>
                        {k.type && <span style={{ background: "#10b98122", color: "#6ee7b7", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{k.type}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${k.rel}%`, height: "100%", background: "#10b981", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{k.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {inv.mSkills.length === 0 && inv.mKnow.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>No AIP skill or knowledge links — investigation unsupported.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess footer */}
      <div style={{ padding: "8px 14px", borderTop: "1px solid #1e3a5f" }}>
        {assess && <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>{assess}</div>}
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            background: assessing ? "rgba(6,182,212,0.1)" : "rgba(6,182,212,0.15)",
            border: "1px solid #06b6d4", color: "#06b6d4",
            borderRadius: 4, padding: "5px 14px", fontSize: 11,
            cursor: assessing ? "default" : "pointer", fontFamily: "monospace",
          }}
        >
          {assessing ? "▶ assessing…" : "▶ ASSESS INVESTIGATION RESOURCES"}
        </button>
      </div>
    </div>
  );
}
