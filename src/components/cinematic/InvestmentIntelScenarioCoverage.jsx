/**
 * F281 — Investment × IntelProfile × Scenario Strategic Coverage Nexus (IISCOVNEX)
 *
 * Parallel-fetches /entities/Investment, /entities/IntelProfile, /v1/scenario/list;
 * keyword-correlates each investment against intel profiles AND scenarios to classify:
 *   FULLY_MAPPED     — matched by ≥1 intel profile AND ≥1 scenario
 *   INTEL_LINKED     — intel profile match only
 *   SCENARIO_DRIVEN  — scenario match only
 *   UNTRACKED        — no match (strategic coverage gap)
 *
 * Stat tiles: INVESTMENTS / INTEL PROFILES / SCENARIOS / COV%
 * Class tiles: FULLY MAPPED / INTEL LINKED / SCENARIO DRIVEN / UNTRACKED
 * Coverage bar (green≥70% / amber≥40% / red<40%)
 * Filter tabs: ALL | FULLY_MAPPED | INTEL_LINKED | SCENARIO_DRIVEN | UNTRACKED
 * Expand any investment → matched intel profile cards (cyan) + scenario cards (yellow) with relevance bars
 * UNTRACKED rows pulse red
 * ▶ ASSESS STRATEGIC COVERAGE → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ IISCOVNEX  left:1113520, bottom:8, zIndex:704
 * Voice:   "iiscovnex / investment intel scenario / strategic coverage nexus /
 *           investment scenario / untracked investment / investment intel profile /
 *           strategic investment coverage / investment coverage nexus"
 * Event:   jarvis:iiscovnex-toggle
 * Refresh: 90-s auto-poll
 */
import { useCallback, useEffect, useRef, useState } from "react";

const BTN_LEFT = 1113520;
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

const IISCOVNEX_RE =
  /\b(iiscovnex|investment\s+intel\s+scenario|strategic\s+coverage\s+nexus|investment\s+scenario|untracked\s+investment|investment\s+intel\s+profile|strategic\s+investment\s+coverage|investment\s+coverage\s+nexus)\b/i;

export function isIiscovnexQuery(q) { return IISCOVNEX_RE.test(q); }

export async function buildIiscovnexScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [iRes, pRes, sRes] = await Promise.all([
      fetch(`${base}/entities/Investment`,  { headers: hdr }),
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,      { headers: hdr }),
    ]);
    const iRaw = await iRes.json();
    const pRaw = await pRes.json();
    const sRaw = await sRes.json();

    const investments = normaliseInvestments(iRaw);
    const profiles    = normaliseProfiles(pRaw);
    const scenarios   = normaliseScenarios(sRaw);
    const corr        = buildCorrelated(investments, profiles, scenarios);

    const fully    = corr.filter(c => c.cls === "FULLY_MAPPED").length;
    const intelOnly = corr.filter(c => c.cls === "INTEL_LINKED").length;
    const scenOnly  = corr.filter(c => c.cls === "SCENARIO_DRIVEN").length;
    const untracked = corr.filter(c => c.cls === "UNTRACKED").length;
    const pct       = investments.length ? Math.round((fully / investments.length) * 100) : 0;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS investment strategic coverage assessment (IISCOVNEX): ${investments.length} investments cross-referenced ` +
          `against ${profiles.length} intelligence profiles and ${scenarios.length} scenarios. ` +
          `FULLY_MAPPED: ${fully}, INTEL_LINKED: ${intelOnly}, SCENARIO_DRIVEN: ${scenOnly}, UNTRACKED (gap): ${untracked}. ` +
          `Full strategic coverage: ${pct}%. Give a 2-sentence strategic investment intelligence brief — formal British butler tone, first person.`,
      }),
    });
    if (!r.ok) throw new Error("agent chat failed");
    const j = await r.json();
    return j.response || j.message || j.content || "";
  } catch {
    return "IISCOVNEX online, sir. Assessing investment strategic coverage across intelligence profiles and scenarios.";
  }
}

// ── normalisation ─────────────────────────────────────────────────────────────

function normaliseInvestments(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)       ? raw.items
    : Array.isArray(raw?.data)        ? raw.data
    : Array.isArray(raw?.investments) ? raw.investments
    : [];
  return arr.map(i => ({
    id:     i.id || i._id || String(Math.random()),
    name:   i.name || i.title || i.investment_name || "Unnamed Investment",
    type:   i.type || i.investment_type || "",
    status: i.status || i.state || "",
    desc:   `${i.name || ""} ${i.title || ""} ${i.description || ""} ${i.type || ""} ${i.status || ""} ${i.sector || ""} ${(i.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)    ? raw.items
    : Array.isArray(raw?.data)     ? raw.data
    : Array.isArray(raw?.profiles) ? raw.profiles
    : [];
  return arr.map(p => ({
    id:   p.id || p._id || String(Math.random()),
    name: p.name || p.title || p.profile_name || "Unnamed Profile",
    org:  p.org || p.organization || p.company || "",
    role: p.role || p.position || "",
    desc: `${p.name || ""} ${p.title || ""} ${p.description || ""} ${p.org || ""} ${p.role || ""} ${p.sector || ""} ${(p.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw) ? raw
    : Array.isArray(raw?.items)     ? raw.items
    : Array.isArray(raw?.data)      ? raw.data
    : Array.isArray(raw?.scenarios) ? raw.scenarios
    : [];
  return arr.map(s => ({
    id:   s.id || s._id || String(Math.random()),
    name: s.name || s.title || s.scenario_name || "Unnamed Scenario",
    type: s.type || s.scenario_type || "",
    desc: `${s.name || ""} ${s.title || ""} ${s.description || ""} ${s.type || ""} ${s.status || ""} ${(s.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function tokenize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(tokens, desc) {
  const hits = tokens.filter(t => desc.includes(t)).length;
  return tokens.length ? Math.round((hits / tokens.length) * 100) : 0;
}

function buildCorrelated(investments, profiles, scenarios) {
  return investments.map(inv => {
    const tokens    = tokenize(inv.desc);
    const mProfiles = profiles
      .map(p => ({ ...p, rel: relevance(tokens, p.desc) }))
      .filter(p => p.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const mScenarios = scenarios
      .map(s => ({ ...s, rel: relevance(tokens, s.desc) }))
      .filter(s => s.rel > 0)
      .sort((a, b) => b.rel - a.rel)
      .slice(0, 5);
    const hasProf = mProfiles.length > 0;
    const hasScen = mScenarios.length > 0;
    let cls;
    if (hasProf && hasScen) cls = "FULLY_MAPPED";
    else if (hasProf)       cls = "INTEL_LINKED";
    else if (hasScen)       cls = "SCENARIO_DRIVEN";
    else                    cls = "UNTRACKED";
    return { ...inv, cls, mProfiles, mScenarios };
  });
}

// ── component ─────────────────────────────────────────────────────────────────
export default function InvestmentIntelScenarioCoverage() {
  const [open,        setOpen]        = useState(false);
  const [tab,         setTab]         = useState("ALL");
  const [search,      setSearch]      = useState("");
  const [investments, setInvestments] = useState([]);
  const [profiles,    setProfiles]    = useState([]);
  const [scenarios,   setScenarios]   = useState([]);
  const [corr,        setCorr]        = useState([]);
  const [expanded,    setExpanded]    = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [assess,      setAssess]      = useState("");
  const [assessing,   setAssessing]   = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [iRes, pRes, sRes] = await Promise.all([
        fetch(`${base}/entities/Investment`,   { headers: hdr }),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,       { headers: hdr }),
      ]);
      const iRaw = await iRes.json();
      const pRaw = await pRes.json();
      const sRaw = await sRes.json();
      const i = normaliseInvestments(iRaw);
      const p = normaliseProfiles(pRaw);
      const s = normaliseScenarios(sRaw);
      setInvestments(i); setProfiles(p); setScenarios(s);
      setCorr(buildCorrelated(i, p, s));
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
    window.addEventListener("jarvis:iiscovnex-toggle", handler);
    return () => window.removeEventListener("jarvis:iiscovnex-toggle", handler);
  }, []);

  const handleAssess = useCallback(async () => {
    setAssessing(true); setAssess("");
    const script = await buildIiscovnexScript();
    setAssess(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  }, []);

  const fully      = corr.filter(c => c.cls === "FULLY_MAPPED").length;
  const intelOnly  = corr.filter(c => c.cls === "INTEL_LINKED").length;
  const scenOnly   = corr.filter(c => c.cls === "SCENARIO_DRIVEN").length;
  const untracked  = corr.filter(c => c.cls === "UNTRACKED").length;
  const pct        = investments.length ? Math.round((fully / investments.length) * 100) : 0;

  const TABS = ["ALL", "FULLY_MAPPED", "INTEL_LINKED", "SCENARIO_DRIVEN", "UNTRACKED"];

  const visible = corr.filter(c => {
    const matchTab    = tab === "ALL" || c.cls === tab;
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const clsColor = cls => ({
    FULLY_MAPPED:     "#22c55e",
    INTEL_LINKED:     "#22d3ee",
    SCENARIO_DRIVEN:  "#eab308",
    UNTRACKED:        "#dc2626",
  }[cls] || "#6b7280");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 704,
          background: "rgba(0,0,0,0.7)", border: "1px solid #22d3ee",
          color: "#22d3ee", padding: "4px 10px", fontSize: 11,
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ IISCOVNEX {untracked > 0 && <span style={{ color: "#ef4444", marginLeft: 4 }}>● {untracked}</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 20, top: 60, width: 720, maxHeight: "85vh",
      background: "rgba(0,4,12,0.97)", border: "1px solid #22d3ee",
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1e3a5f", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#22d3ee", fontWeight: 700, fontSize: 13 }}>
          ◈ IISCOVNEX — Investment × IntelProfile × Scenario Strategic Coverage
        </span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}>✕</button>
      </div>

      {/* primary stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "10px 14px 6px" }}>
        {[
          { label: "INVESTMENTS",    val: investments.length, col: "#22d3ee" },
          { label: "INTEL PROFILES", val: profiles.length,    col: "#22d3ee" },
          { label: "SCENARIOS",      val: scenarios.length,   col: "#eab308" },
          { label: "COV%",           val: `${pct}%`,          col: pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444" },
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
          { label: "FULLY MAPPED",    val: fully,     col: "#22c55e" },
          { label: "INTEL LINKED",    val: intelOnly,  col: "#22d3ee" },
          { label: "SCENARIO DRIVEN", val: scenOnly,   col: "#eab308" },
          { label: "UNTRACKED",       val: untracked,  col: "#dc2626" },
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
            background: tab === t ? "#22d3ee" : "rgba(255,255,255,0.05)",
            color: tab === t ? "#000" : "#94a3b8", border: "none",
            borderRadius: 4, padding: "3px 8px", fontSize: 10, cursor: "pointer",
          }}>
            {t.replace(/_/g, " ")}
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="search investments…"
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
          <div style={{ color: "#64748b", textAlign: "center", padding: 20, fontSize: 12 }}>No investments match.</div>
        )}
        {visible.map(inv => (
          <div key={inv.id} style={{ marginBottom: 6 }}>
            <div
              onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
              style={{
                background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "8px 12px",
                cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                border: `1px solid ${inv.cls === "UNTRACKED" ? "rgba(220,38,38,0.4)" : "transparent"}`,
                animation: inv.cls === "UNTRACKED" ? "iiscovnex-pulse 2s ease-in-out infinite" : "none",
              }}
            >
              <div>
                <span style={{ color: "#e2e8f0", fontSize: 12, fontWeight: 600 }}>{inv.name}</span>
                {inv.type && (
                  <span style={{ background: "#22d3ee22", color: "#22d3ee", borderRadius: 3, padding: "1px 5px", fontSize: 9, marginLeft: 6 }}>
                    {inv.type}
                  </span>
                )}
                {inv.status && <span style={{ color: "#64748b", fontSize: 10, marginLeft: 6 }}>{inv.status}</span>}
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
                {/* intel profiles */}
                {inv.mProfiles.length > 0 && (
                  <>
                    <div style={{ color: "#22d3ee", fontSize: 10, fontWeight: 700, marginBottom: 4, letterSpacing: 1 }}>INTEL PROFILES ({inv.mProfiles.length})</div>
                    {inv.mProfiles.map(p => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#a5f3fc", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                        {p.org && <span style={{ background: "#22d3ee22", color: "#a5f3fc", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{p.org}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${p.rel}%`, height: "100%", background: "#22d3ee", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{p.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {/* scenarios */}
                {inv.mScenarios.length > 0 && (
                  <>
                    <div style={{ color: "#eab308", fontSize: 10, fontWeight: 700, margin: "8px 0 4px", letterSpacing: 1 }}>SCENARIOS ({inv.mScenarios.length})</div>
                    {inv.mScenarios.map(s => (
                      <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ color: "#fde68a", fontSize: 11, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                        {s.type && <span style={{ background: "#eab30822", color: "#fde68a", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}>{s.type}</span>}
                        <div style={{ width: 80, height: 4, background: "#1e293b", borderRadius: 2, flexShrink: 0 }}>
                          <div style={{ width: `${s.rel}%`, height: "100%", background: "#eab308", borderRadius: 2 }} />
                        </div>
                        <span style={{ color: "#64748b", fontSize: 9, width: 28, textAlign: "right" }}>{s.rel}%</span>
                      </div>
                    ))}
                  </>
                )}
                {inv.mProfiles.length === 0 && inv.mScenarios.length === 0 && (
                  <div style={{ color: "#ef4444", fontSize: 11 }}>No intel profile or scenario links — investment untracked.</div>
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
            background: assessing ? "rgba(34,211,238,0.1)" : "rgba(34,211,238,0.15)",
            border: "1px solid #22d3ee", color: "#22d3ee",
            borderRadius: 4, padding: "5px 14px", fontSize: 11,
            cursor: assessing ? "default" : "pointer", fontFamily: "monospace",
          }}
        >
          {assessing ? "▶ assessing…" : "▶ ASSESS STRATEGIC COVERAGE"}
        </button>
      </div>

      <style>{`
        @keyframes iiscovnex-pulse {
          0%, 100% { border-color: rgba(220,38,38,0.4); }
          50%       { border-color: rgba(220,38,38,0.9); }
        }
      `}</style>
    </div>
  );
}
