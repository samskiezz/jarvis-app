/**
 * F752 — Investment × Graph Centrality × Skill Triple Nexus (IGSKLTRI)
 * Endpoints: /entities/Investment  ×  /v1/graph/centrality  ×  /v1/aip/skill
 * Classification: FULLY_COVERED | NODE_ONLY | SKILL_ONLY | DARK
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY  = "#29E7FF";
const AM  = "#FFB347";
const GN  = "#39FF14";
const RD  = "#FF4444";
const DIM = "#8899AA";

const BTN_LEFT = 917_780;
const POLL_MS  = 90_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IGSKLTRI_RE =
  /\b(igskltri|investment\s+graph\s+skill|portfolio\s+graph\s+skill|skill\s+graph\s+investment|investment\s+centrality|portfolio\s+node\s+skill|investment\s+node\s+coverage|dark\s+investment\s+graph|graph\s+skill\s+portfolio|portfolio\s+skill\s+coverage|investment\s+triple\s+nexus|covered\s+portfolio|node\s+skill\s+investment)\b/i;

export function isIgsklTriQuery(t) {
  return IGSKLTRI_RE.test(t || "");
}

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

function normaliseInvestments(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.investments)) return raw.investments;
  if (raw && Array.isArray(raw.data))        return raw.data;
  if (raw && Array.isArray(raw.items))       return raw.items;
  return [];
}

function normaliseNodes(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.nodes)) return raw.nodes;
  if (raw && Array.isArray(raw.data))  return raw.data;
  if (raw && Array.isArray(raw.items)) return raw.items;
  return [];
}

function normaliseSkills(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.skills)) return raw.skills;
  if (raw && Array.isArray(raw.data))   return raw.data;
  if (raw && Array.isArray(raw.items))  return raw.items;
  return [];
}

function keywords(obj) {
  return [
    obj.name, obj.title, obj.description, obj.label,
    obj.type, obj.category, obj.kind, obj.summary,
    obj.tags, obj.ticker, obj.sector, obj.domain,
    obj.source, obj.target, obj.entity_type,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function scoreMatch(aKw, bKw) {
  if (!aKw || !bKw) return 0;
  return aKw.split(/\s+/).filter(w => w.length > 3 && bKw.includes(w)).length;
}

function buildNexus(investments, nodes, skills) {
  return investments.map(inv => {
    const iKw = keywords(inv);

    const bestNode = nodes.reduce(
      (best, n) => {
        const s = scoreMatch(iKw, keywords(n));
        return s > best.score ? { score: s, n } : best;
      },
      { score: 0, n: null },
    );

    const bestSkill = skills.reduce(
      (best, sk) => {
        const s = scoreMatch(iKw, keywords(sk));
        return s > best.score ? { score: s, sk } : best;
      },
      { score: 0, sk: null },
    );

    const hasNode  = bestNode.score  > 0;
    const hasSkill = bestSkill.score > 0;

    const classification =
      hasNode && hasSkill ? "FULLY_COVERED"
      : hasNode           ? "NODE_ONLY"
      : hasSkill          ? "SKILL_ONLY"
      :                     "DARK";

    return {
      inv,
      classification,
      bestNode:  bestNode.n,
      nodeScore: bestNode.score,
      bestSkill: bestSkill.sk,
      skillScore: bestSkill.score,
    };
  });
}

export async function buildIgsklTriScript() {
  const base = apiBase();
  try {
    const [invR, nodeR, skillR] = await Promise.all([
      fetch(`${base}/entities/Investment`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/graph/centrality`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/v1/aip/skill`,             { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const investments = normaliseInvestments(await invR.json());
    const nodes       = normaliseNodes(await nodeR.json());
    const skills      = normaliseSkills(await skillR.json());
    const nexus       = buildNexus(investments, nodes, skills);
    const dark        = nexus.filter(r => r.classification === "FULLY_COVERED").length;
    const uncovered   = nexus.filter(r => r.classification === "DARK").length;
    const pct         = investments.length
      ? Math.round((dark / investments.length) * 100) : 0;

    const brief = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message: `Investment × Graph × Skill coverage: ${investments.length} holdings, ${dark} fully covered (node+skill), ${uncovered} dark (no graph node or skill backing). Coverage ${pct}%. Summarise portfolio intelligence coverage in 2 sentences.`,
      }),
    });
    const bd = await brief.json();
    return (bd.answer || "").trim() ||
      `${investments.length} investments analysed. ${dark} fully covered (graph node + skill), ${uncovered} dark — no node or skill backing detected.`;
  } catch (e) {
    return `IGSKLTRI fetch error: ${e.message}`;
  }
}

const TABS = ["ALL", "FULLY_COVERED", "NODE_ONLY", "SKILL_ONLY", "DARK"];

const BADGE_COLOR = {
  FULLY_COVERED: GN,
  NODE_ONLY:     CY,
  SKILL_ONLY:    AM,
  DARK:          RD,
};

export default function InvestmentGraphSkillTriple() {
  const [open, setOpen]         = useState(false);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("ALL");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState(null);
  const [badgeDark, setBadgeDark] = useState(0);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    try {
      const [invR, nodeR, skillR] = await Promise.all([
        fetch(`${base}/entities/Investment`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/v1/aip/skill`,        { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const investments = normaliseInvestments(await invR.json());
      const nodes       = normaliseNodes(await nodeR.json());
      const skills      = normaliseSkills(await skillR.json());
      const nexus       = buildNexus(investments, nodes, skills);
      setRows(nexus);
      setBadgeDark(nexus.filter(r => r.classification === "DARK").length);
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => {
      if (!v) load();
      return !v;
    });
    window.addEventListener("jarvis:igskltri-toggle", onToggle);
    return () => window.removeEventListener("jarvis:igskltri-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = rows.filter(r => {
    const matchTab  = tab === "ALL" || r.classification === tab;
    const matchSrch = !search ||
      keywords(r.inv).includes(search.toLowerCase()) ||
      (r.bestNode  && keywords(r.bestNode).includes(search.toLowerCase())) ||
      (r.bestSkill && keywords(r.bestSkill).includes(search.toLowerCase()));
    return matchTab && matchSrch;
  });

  const counts = {
    total:         rows.length,
    FULLY_COVERED: rows.filter(r => r.classification === "FULLY_COVERED").length,
    NODE_ONLY:     rows.filter(r => r.classification === "NODE_ONLY").length,
    SKILL_ONLY:    rows.filter(r => r.classification === "SKILL_ONLY").length,
    DARK:          rows.filter(r => r.classification === "DARK").length,
  };
  const pct = counts.total ? Math.round((counts.FULLY_COVERED / counts.total) * 100) : 0;

  const panel = open ? (
    <div style={{
      position: "fixed", left: BTN_LEFT, bottom: 56, zIndex: 611,
      width: "min(680px,92vw)", maxHeight: "70vh",
      background: "rgba(6,11,19,0.93)", border: `1px solid ${CY}55`,
      borderRadius: 14, padding: "14px 16px",
      backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}18`,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11 }}>
          ◈ IGSKLTRI — INVESTMENT × GRAPH × SKILL
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: DIM }}>
          {loading ? "loading…" : `${counts.total} investments · ${pct}% covered`}
        </span>
        <button onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["INVESTMENTS", counts.total,         CY],
          ["FULLY COV.",  counts.FULLY_COVERED,  GN],
          ["NODE ONLY",   counts.NODE_ONLY,       CY],
          ["SKILL ONLY",  counts.SKILL_ONLY,      AM],
          ["DARK",        counts.DARK,            RD],
          ["COVERAGE",    `${pct}%`,             pct >= 60 ? GN : pct >= 30 ? AM : RD],
        ].map(([lbl, val, col]) => (
          <div key={lbl} style={{
            background: "rgba(0,0,0,0.4)", border: `1px solid ${col}44`,
            borderRadius: 8, padding: "6px 12px", textAlign: "center", minWidth: 80,
          }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: col }}>{val}</div>
            <div style={{ fontSize: 9, color: DIM, letterSpacing: 1 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${CY}22` : "transparent",
              border: `1px solid ${tab === t ? CY : DIM + "55"}`,
              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
              color: tab === t ? CY : DIM, fontSize: 10, letterSpacing: 1,
            }}>{t}</button>
        ))}
      </div>

      {/* search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search investments / nodes / skills…"
        style={{
          background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}33`,
          borderRadius: 8, padding: "6px 12px", color: "#DCEBF5",
          fontFamily: "inherit", fontSize: 11, outline: "none",
        }}
      />

      {/* rows */}
      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
        {visible.slice(0, 80).map((r, i) => {
          const isExp = expanded === i;
          const col   = BADGE_COLOR[r.classification];
          const name  = r.inv.name || r.inv.title || r.inv.ticker || `Investment ${i + 1}`;
          return (
            <div key={i}
              onClick={() => setExpanded(isExp ? null : i)}
              style={{
                background: isExp ? "rgba(41,231,255,0.06)" : "rgba(0,0,0,0.3)",
                border: `1px solid ${col}33`,
                borderRadius: 8, padding: "7px 12px", cursor: "pointer",
                transition: "background 0.15s",
              }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11, color: "#DCEBF5", flex: 1 }}>{name}</span>
                {r.inv.ticker && (
                  <span style={{
                    fontSize: 9, background: `${AM}22`, border: `1px solid ${AM}44`,
                    borderRadius: 4, padding: "1px 6px", color: AM,
                  }}>{r.inv.ticker}</span>
                )}
                <span style={{
                  fontSize: 9, background: `${col}22`, border: `1px solid ${col}55`,
                  borderRadius: 4, padding: "1px 6px", color: col, letterSpacing: 1,
                }}>{r.classification}</span>
              </div>
              {isExp && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 5 }}>
                  {r.bestNode ? (
                    <div style={{ fontSize: 10, color: CY }}>
                      <b style={{ color: CY }}>Graph Node:</b>{" "}
                      {r.bestNode.label || r.bestNode.name || "node"}{" "}
                      <span style={{ color: DIM }}>
                        (type: {r.bestNode.entity_type || r.bestNode.type || "—"}, score: {r.bestNode.centrality_score ?? "—"}, hits: {r.nodeScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching graph node found.</div>
                  )}
                  {r.bestSkill ? (
                    <div style={{ fontSize: 10, color: AM }}>
                      <b style={{ color: AM }}>Skill:</b>{" "}
                      {r.bestSkill.name || r.bestSkill.title || "skill"}{" "}
                      <span style={{ color: DIM }}>
                        (domain: {r.bestSkill.domain || "—"}, score: {r.bestSkill.score ?? "—"}, hits: {r.skillScore})
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: DIM }}>No matching skill found.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
            No investments match current filter.
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      {panel}
      <button
        onClick={() => { setOpen(v => { if (!v) load(); return !v; }); }}
        title="Investment × Graph × Skill Triple Nexus (IGSKLTRI)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 611,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          borderRadius: 8, cursor: "pointer",
          color: open ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "4px 8px",
          boxShadow: open ? `0 0 18px ${CY}44` : "none",
          backdropFilter: "blur(6px)",
          whiteSpace: "nowrap",
        }}>
        ◈ IGSKLTRI
        {badgeDark > 0 && (
          <span style={{
            marginLeft: 4, background: AM, color: "#04060A",
            borderRadius: 4, fontSize: 8, padding: "1px 4px", fontWeight: 700,
          }}>{badgeDark}</span>
        )}
      </button>
    </>
  );
}
