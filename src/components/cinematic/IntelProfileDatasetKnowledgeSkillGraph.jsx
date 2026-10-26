/**
 * IntelProfileDatasetKnowledgeSkillGraph — F195
 * Fetches /entities/IntelProfile + /v1/datasets + /knowledge/ +
 * /v1/aip/skill + /v1/graph/centrality and cross-references each
 * intel profile against all 4 other sources.
 * Classifies:
 *   GROUNDED — profile has matches across 4 sources
 *   CAPABLE  — profile has 2–3 source matches
 *   KNOWN    — profile has 1 source match
 *   DARK     — profile has 0 matches (no dataset, knowledge, skill, or graph trace)
 * Red pulse on DARK count.
 * ASSESS → /v1/jarvis/agent/chat advisory for dark profiles + TTS.
 * Voice triggers: "intel capability"/"idksgf"/"profile capability"/
 *   "intel foundation"/"dark profiles"/"profile grounding"
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF4D6D";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const PRP = "#B485FF";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const IDKSGF_RE =
  /\b(intel.capability|idksgf|profile.capability|intel.foundation|dark.profiles?|profile.grounding|intel.profile.dataset|capability.foundation|idksgf.toggle)\b/i;

export function isIdksgfQuery(t) { return IDKSGF_RE.test(t || ""); }

export function buildIdksgfScript(rows) {
  const dark = rows.filter(r => r.cls === "DARK");
  if (!dark.length) return "All intel profiles have at least one supporting intelligence resource. No capability blind spots detected.";
  return `You are JARVIS. ${dark.length} intel profile(s) are DARK — they have no matched dataset, no knowledge article, no skill support, and no graph trace. List each dark profile by name and category. Then provide a 2-sentence intelligence capability advisory: what resources should be linked or assigned to ground each profile operationally. Be direct and specific.`;
}

const hdrs = { Authorization: `Bearer ${API_KEY}` };

async function fetchIntelProfiles() {
  const r = await fetch(`${apiBase()}/entities/IntelProfile`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.profiles) ? d.profiles :
    Array.isArray(d?.intel_profiles) ? d.intel_profiles :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(p => ({
    id: p.id || p._id || String(Math.random()),
    name: (p.name || p.title || p.subject || "").toString(),
    category: p.category || p.type || p.profile_type || "",
  }));
}

async function fetchDatasets() {
  const r = await fetch(`${apiBase()}/v1/datasets`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.datasets) ? d.datasets :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(ds => ({
    id: ds.id || ds._id || String(Math.random()),
    name: (ds.name || ds.title || "").toString(),
    rows: typeof ds.rows === "number" ? ds.rows :
          typeof ds.row_count === "number" ? ds.row_count :
          typeof ds.count === "number" ? ds.count : null,
  }));
}

async function fetchKnowledge() {
  const r = await fetch(`${apiBase()}/knowledge/`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.articles) ? d.articles :
    Array.isArray(d?.items) ? d.items :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(k => ({
    id: k.id || k._id || String(Math.random()),
    name: (k.title || k.name || k.subject || "").toString(),
    category: k.category || k.type || "",
  }));
}

async function fetchSkills() {
  const r = await fetch(`${apiBase()}/v1/aip/skill`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.skills) ? d.skills :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(s => ({
    id: s.id || s._id || String(Math.random()),
    name: (s.name || s.title || s.skill || "").toString(),
    score: typeof s.score === "number" ? s.score :
           typeof s.level === "number" ? s.level : null,
  }));
}

async function fetchGraphCentrality() {
  const r = await fetch(`${apiBase()}/v1/graph/centrality`, { headers: hdrs });
  if (!r.ok) return [];
  const d = await r.json();
  const items =
    Array.isArray(d) ? d :
    Array.isArray(d?.nodes) ? d.nodes :
    Array.isArray(d?.data) ? d.data : [];
  return items.map(n => ({
    id: n.id || n._id || String(Math.random()),
    name: (n.name || n.label || n.entity || "").toString(),
    score: typeof n.centrality === "number" ? n.centrality :
           typeof n.score === "number" ? n.score : null,
  }));
}

function kw(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(w => w.length > 2);
}

function matches(profile, pool) {
  const pk = kw(profile.name + " " + profile.category);
  return pool.filter(p => {
    const ik = kw(p.name);
    return pk.some(w => ik.includes(w)) || ik.some(w => pk.includes(w));
  });
}

function classify(profile, datasets, knowledge, skills, graphNodes) {
  const ds = matches(profile, datasets);
  const kn = matches(profile, knowledge);
  const sk = matches(profile, skills);
  const gn = matches(profile, graphNodes);
  const score = [ds.length > 0, kn.length > 0, sk.length > 0, gn.length > 0].filter(Boolean).length;
  const cls =
    score === 4 ? "GROUNDED" :
    score >= 2  ? "CAPABLE" :
    score === 1 ? "KNOWN" : "DARK";
  return { ...profile, cls, matchedDs: ds, matchedKn: kn, matchedSk: sk, matchedGn: gn };
}

const clsColor = { GROUNDED: GRN, CAPABLE: CY, KNOWN: AMB, DARK: RED };
const clsOrder = { GROUNDED: 0, CAPABLE: 1, KNOWN: 2, DARK: 3 };

const CatBadge = ({ s }) =>
  s ? <span style={{ fontSize: 10, border: `1px solid ${AMB}`, color: AMB, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{s}</span> : null;

const ScoreBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${CY}`, color: CY, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{typeof v === "number" ? v.toFixed(2) : v}</span> : null;

const RowsBadge = ({ v }) =>
  v != null ? <span style={{ fontSize: 10, border: `1px solid ${PRP}`, color: PRP, borderRadius: 3, padding: "1px 4px", marginLeft: 4 }}>{v.toLocaleString()} rows</span> : null;

export default function IntelProfileDatasetKnowledgeSkillGraph() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);
  const [expanded, setExp]    = useState({});
  const [filter, setFilter]   = useState("ALL");
  const [assessing, setAss]   = useState(false);
  const [advice, setAdvice]   = useState("");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [profiles, datasets, knowledge, skills, graphNodes] = await Promise.all([
        fetchIntelProfiles(), fetchDatasets(), fetchKnowledge(),
        fetchSkills(), fetchGraphCentrality(),
      ]);
      const classified = profiles
        .map(p => classify(p, datasets, knowledge, skills, graphNodes))
        .sort((a, b) => clsOrder[a.cls] - clsOrder[b.cls]);
      setRows(classified);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:idksgf-toggle", toggle);
    return () => window.removeEventListener("jarvis:idksgf-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    setAss(true); setAdvice("");
    const script = buildIdksgfScript(rows);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdrs, "Content-Type": "application/json" },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || "";
      setAdvice(text);
      if (text) {
        try {
          await fetch(`${apiBase()}/v1/voice/tts`, {
            method: "POST",
            headers: { ...hdrs, "Content-Type": "application/json" },
            body: JSON.stringify({ text: text.slice(0, 400) }),
          });
        } catch { /* TTS optional */ }
      }
    } catch (e) {
      setAdvice("Advisory unavailable: " + e.message);
    } finally {
      setAss(false);
    }
  }, [rows]);

  const darkCount = rows.filter(r => r.cls === "DARK").length;
  const visible   = filter === "ALL" ? rows : rows.filter(r => r.cls === filter);

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        title="IntelProfile × Dataset × Knowledge × Skill × Graph Intelligence Capability Foundation"
        style={{
          position: "fixed", bottom: 8, left: 157000, zIndex: 291,
          background: "rgba(0,0,0,0.7)", border: `1px solid ${darkCount > 0 ? RED : CY}`,
          color: darkCount > 0 ? RED : CY, fontSize: 10, padding: "3px 7px",
          borderRadius: 4, cursor: "pointer", fontFamily: "monospace",
          boxShadow: darkCount > 0 ? `0 0 8px ${RED}88` : "none",
          animation: darkCount > 0 ? "pulse-red 2s infinite" : "none",
        }}
      >
        ◈ IDKSGF{darkCount > 0 ? ` ⚠${darkCount}` : ""}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 60, right: 16, width: 560, maxHeight: "80vh",
      background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 8, zIndex: 9999, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: CY, fontSize: 12,
      boxShadow: `0 0 24px ${CY}22`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: `1px solid ${CY}33` }}>
        <span style={{ flex: 1, fontWeight: "bold", fontSize: 11 }}>
          ◈ IDKSGF — INTELPROFILE × DATASET × KNOWLEDGE × SKILL × GRAPH
        </span>
        {darkCount > 0 && (
          <span style={{ color: RED, fontWeight: "bold", marginRight: 10,
            animation: "pulse-red 2s infinite" }}>
            ⚠ {darkCount} DARK
          </span>
        )}
        <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${CY}55`, color: CY, borderRadius: 3, padding: "2px 7px", cursor: "pointer", fontSize: 10, marginRight: 6 }}>
          {loading ? "…" : "↺"}
        </button>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* filter tabs */}
      <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
        {["ALL", "GROUNDED", "CAPABLE", "KNOWN", "DARK"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            background: filter === f ? `${clsColor[f] || CY}22` : "transparent",
            border: `1px solid ${clsColor[f] || CY}55`,
            color: clsColor[f] || CY, borderRadius: 3, padding: "2px 7px",
            cursor: "pointer", fontSize: 10,
          }}>
            {f}
            <span style={{ marginLeft: 4, opacity: 0.7 }}>
              {f === "ALL" ? rows.length : rows.filter(r => r.cls === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* rows */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {err && <div style={{ color: RED, padding: 8 }}>Error: {err}</div>}
        {!loading && !err && visible.length === 0 && (
          <div style={{ opacity: 0.5, padding: 8 }}>No intel profiles to display.</div>
        )}
        {visible.map(row => (
          <div key={row.id} style={{ borderBottom: `1px solid ${CY}18`, padding: "5px 0" }}>
            <div
              onClick={() => setExp(e => ({ ...e, [row.id]: !e[row.id] }))}
              style={{ display: "flex", alignItems: "center", cursor: "pointer", gap: 6 }}
            >
              <span style={{ color: clsColor[row.cls], fontWeight: "bold", minWidth: 72 }}>{row.cls}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name || "(no name)"}</span>
              {row.category && <CatBadge s={row.category} />}
              <span style={{ opacity: 0.4, fontSize: 10 }}>{expanded[row.id] ? "▲" : "▼"}</span>
            </div>
            {expanded[row.id] && (
              <div style={{ paddingLeft: 16, paddingTop: 4, opacity: 0.85 }}>
                {row.matchedDs.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: PRP }}>datasets: </span>
                    {row.matchedDs.slice(0, 3).map(d => (
                      <span key={d.id}>{d.name}<RowsBadge v={d.rows} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedKn.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: AMB }}>knowledge: </span>
                    {row.matchedKn.slice(0, 3).map(k => (
                      <span key={k.id}>{k.name}<CatBadge s={k.category} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedSk.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: GRN }}>skills: </span>
                    {row.matchedSk.slice(0, 3).map(s => (
                      <span key={s.id}>{s.name}<ScoreBadge v={s.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.matchedGn.length > 0 && (
                  <div style={{ marginBottom: 3 }}>
                    <span style={{ color: CY }}>graph nodes: </span>
                    {row.matchedGn.slice(0, 3).map(n => (
                      <span key={n.id}>{n.name}<ScoreBadge v={n.score} />{" "}</span>
                    ))}
                  </div>
                )}
                {row.cls === "DARK" && (
                  <div style={{ color: RED, fontSize: 10, opacity: 0.8 }}>
                    ⚠ No dataset, knowledge, skill, or graph coverage — intelligence capability blind spot.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* assess */}
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${CY}33` }}>
        <button
          onClick={assess}
          disabled={assessing || rows.length === 0}
          style={{
            background: `${RED}22`, border: `1px solid ${RED}88`,
            color: RED, borderRadius: 4, padding: "4px 14px",
            cursor: assessing ? "wait" : "pointer", fontSize: 11,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS DARK PROFILES"}
        </button>
        {advice && (
          <div style={{ marginTop: 8, color: CY, fontSize: 11, opacity: 0.9,
            maxHeight: 120, overflowY: "auto", borderTop: `1px solid ${CY}22`, paddingTop: 6 }}>
            {advice}
          </div>
        )}
      </div>
    </div>
  );
}
