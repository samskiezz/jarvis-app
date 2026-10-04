/**
 * F91 — Graph Centrality × AIP Skill Coverage (GCAS)
 *
 * Parallel-fetches /v1/graph/centrality + /v1/aip/skill every 90 s.
 * Keyword-correlates each top-centrality graph node (id/label/type)
 * against AIP skills (name/description/category/tags) to classify:
 *   SKILLED    — at least one AIP skill matches this influential node
 *   UNCOVERED  — no skill representation for this high-centrality entity
 *
 * Amber badge on UNCOVERED count.
 *
 * Voice intents: "graph skill / skill graph / gcas /
 *                centrality skill / graph aip / high centrality skill /
 *                influential node skill / graph coverage skill /
 *                aip graph coverage / graph skill gap"
 * Strip button: ◈ GCAS  left:2940 bottom:18 zIndex:68
 * Custom event: jarvis:gcas-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const DIM = "#5A7A9A";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

const GCAS_RE =
  /\b(graph[._\s]?skill|skill[._\s]?graph|gcas|centralit[._\s]?skill|graph[._\s]?aip|high[._\s]?centralit[._\s]?skill|influential[._\s]?node[._\s]?skill|graph[._\s]?coverage[._\s]?skill|aip[._\s]?graph[._\s]?coverage|graph[._\s]?skill[._\s]?gap)\b/i;

export function isGcasQuery(t) { return GCAS_RE.test(t || ""); }

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function relevance(node, skill) {
  const a = tokenize([node.id, node.label, node.type,
    node.entity_type || "", node.community || ""].join(" "));
  const b = tokenize([skill.name, skill.description,
    skill.category || "", (skill.tags || []).join(" ")].join(" "));
  const setB = new Set(b);
  const hits = a.filter(w => setB.has(w)).length;
  if (!hits) return 0;
  return Math.round((hits / Math.max(a.length, 1)) * 100);
}

export async function buildGcasScript() {
  try {
    const base = apiBase();
    const [nr, sr] = await Promise.all([
      fetch(`${base}/v1/graph/centrality`, { headers: hdrs }),
      fetch(`${base}/v1/aip/skill`, { headers: hdrs }),
    ]);
    const [nd, sd] = await Promise.all([nr.json(), sr.json()]);
    const nodes = (Array.isArray(nd) ? nd : nd.nodes || nd.results || []).slice(0, 40);
    const skills = Array.isArray(sd) ? sd : sd.skills || sd.results || [];
    const skilled = nodes.filter(n => skills.some(s => relevance(n, s) > 0)).length;
    const uncovered = nodes.length - skilled;
    return `Graph Centrality × AIP Skill report: ${nodes.length} high-centrality nodes analysed against ${skills.length} AIP skills. ${skilled} nodes are SKILLED (matched), ${uncovered} are UNCOVERED (no skill coverage). ${uncovered > 0 ? `Recommend adding skills for the ${uncovered} uncovered high-influence entities to close the intelligence gap.` : "Full skill coverage across all influential nodes — well deployed."}`;
  } catch {
    return "Graph centrality and AIP skill data temporarily unavailable.";
  }
}

const BTN = {
  position: "fixed", left: 2940, bottom: 18, zIndex: 68,
  background: "rgba(0,20,40,0.82)", border: `1px solid ${CY}44`,
  color: CY, fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
  letterSpacing: 1.4, padding: "4px 8px", cursor: "pointer",
  borderRadius: 3, userSelect: "none",
};
const PANEL = {
  position: "fixed", bottom: 52, left: 2830, width: 420,
  background: "rgba(0,10,24,0.97)", border: `1px solid ${CY}55`,
  borderRadius: 6, zIndex: 200, fontFamily: "'JetBrains Mono',monospace",
  color: CY, fontSize: 10, padding: 14, maxHeight: 520, overflowY: "auto",
};
const ROW_ST = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "4px 0", borderBottom: `1px solid ${CY}18`, cursor: "pointer",
};
const BADGE = (c) => ({
  fontSize: 8, letterSpacing: 1, padding: "1px 5px",
  borderRadius: 2, background: c + "22", border: `1px solid ${c}55`, color: c,
});

export default function GraphCentralityAipSkillCoverage() {
  const [open, setOpen] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [skills, setSkills] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const [nr, sr] = await Promise.all([
        fetch(`${base}/v1/graph/centrality`, { headers: hdrs }),
        fetch(`${base}/v1/aip/skill`, { headers: hdrs }),
      ]);
      const [nd, sd] = await Promise.all([nr.json(), sr.json()]);
      const rawNodes = (Array.isArray(nd) ? nd : nd.nodes || nd.results || []).slice(0, 40);
      const rawSkills = Array.isArray(sd) ? sd : sd.skills || sd.results || [];
      setNodes(rawNodes.map(n => ({
        ...n,
        matches: rawSkills
          .map(s => ({ ...s, score: relevance(n, s) }))
          .filter(s => s.score > 0)
          .sort((a, b) => b.score - a.score),
      })));
      setSkills(rawSkills);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.query && !isGcasQuery(e.detail.query)) return;
      setOpen(v => !v);
    };
    window.addEventListener("jarvis:gcas-toggle", handler);
    return () => window.removeEventListener("jarvis:gcas-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const classified = nodes.map(n => ({ ...n, status: n.matches?.length > 0 ? "SKILLED" : "UNCOVERED" }));
  const filtered = classified
    .filter(n => tab === "ALL" || n.status === tab)
    .filter(n => !search || [n.id, n.label, n.type].join(" ").toLowerCase().includes(search.toLowerCase()));

  const skilled = classified.filter(n => n.status === "SKILLED").length;
  const uncovered = classified.filter(n => n.status === "UNCOVERED").length;

  const assess = async () => {
    setAssessing(true); setAssessment("");
    const script = await buildGcasScript();
    setAssessment(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  if (!open) {
    return (
      <button style={BTN} onClick={() => setOpen(true)} title="Graph Centrality × AIP Skill Coverage">
        ◈ GCAS{uncovered > 0 && <span style={{ marginLeft: 4, color: AMB }}>▲{uncovered}</span>}
      </button>
    );
  }

  return (
    <>
      <button style={{ ...BTN, borderColor: CY }} onClick={() => setOpen(false)}>◈ GCAS ✕</button>
      <div style={PANEL}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: CY, letterSpacing: 2, fontSize: 9 }}>GRAPH CENTRALITY × AIP SKILL</span>
          <button onClick={assess} disabled={assessing}
            style={{ fontSize: 8, color: GRN, background: "none", border: `1px solid ${GRN}44`, borderRadius: 2, padding: "1px 6px", cursor: "pointer" }}>
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 4, marginBottom: 8 }}>
          {[
            ["NODES", nodes.length, CY],
            ["SKILLS", skills.length, CY],
            ["SKILLED", skilled, GRN],
            ["UNCOVERED", uncovered, AMB],
          ].map(([label, val, c]) => (
            <div key={label} style={{ background: "#0a1628", borderRadius: 3, padding: "4px 6px", textAlign: "center" }}>
              <div style={{ color: c, fontSize: 13, fontWeight: 700 }}>{val}</div>
              <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
          {["ALL", "SKILLED", "UNCOVERED"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, cursor: "pointer",
                background: tab === t ? CY + "22" : "none",
                color: tab === t ? CY : DIM,
                border: `1px solid ${tab === t ? CY + "55" : DIM + "33"}` }}>
              {t}
            </button>
          ))}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="search nodes…"
            style={{ marginLeft: "auto", fontSize: 8, background: "#0a1628", border: `1px solid ${CY}33`,
              borderRadius: 2, color: CY, padding: "2px 6px", width: 110, outline: "none" }} />
        </div>

        {/* Node rows */}
        {filtered.length === 0 && (
          <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 12 }}>No data yet — fetching…</div>
        )}
        {filtered.map((n, i) => {
          const isExp = expanded === i;
          const sc = n.status === "SKILLED" ? GRN : AMB;
          return (
            <div key={n.id || i}>
              <div style={ROW_ST} onClick={() => setExpanded(isExp ? null : i)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: CY, fontSize: 9 }}>{n.label || n.id}</span>
                  {n.type && <span style={{ color: DIM, fontSize: 8, marginLeft: 4 }}>{n.type}</span>}
                </div>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {n.centrality != null && (
                    <span style={{ color: DIM, fontSize: 8 }}>{Number(n.centrality).toFixed(3)}</span>
                  )}
                  <span style={BADGE(sc)}>{n.status}</span>
                  <span style={{ color: DIM, fontSize: 8 }}>{isExp ? "▲" : "▼"}</span>
                </div>
              </div>
              {isExp && (
                <div style={{ background: "#060f1e", borderRadius: 3, padding: "6px 8px", marginBottom: 4 }}>
                  {n.matches?.length > 0 ? (
                    n.matches.slice(0, 8).map((s, j) => (
                      <div key={j} style={{ marginBottom: 4 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ color: CY, fontSize: 8 }}>{s.name}</span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {s.category && <span style={BADGE(DIM)}>{s.category}</span>}
                            <span style={{ color: GRN, fontSize: 8 }}>{s.score}%</span>
                          </div>
                        </div>
                        <div style={{ height: 3, background: CY + "18", borderRadius: 2 }}>
                          <div style={{ height: "100%", width: `${s.score}%`, background: GRN, borderRadius: 2 }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div style={{ color: AMB, fontSize: 8 }}>No AIP skill coverage for this node.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {assessment && (
          <div style={{ marginTop: 8, background: "#0a1628", borderRadius: 3, padding: 8, color: GRN, fontSize: 8, lineHeight: 1.5 }}>
            {assessment}
          </div>
        )}
      </div>
    </>
  );
}
