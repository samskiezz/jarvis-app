/**
 * GraphCentralityAipSkill — F208
 *
 * Parallel-fetches /v1/graph/centrality + /v1/aip/skill
 * then keyword-correlates each high-centrality graph node against JARVIS AI
 * skills to surface:
 *   SKILLED   (≥1 skill match) — influential node has AI capability backing
 *   UNSKILLED (0 matches)      — influential node has no AI skill coverage
 *
 * Stat tiles: nodes / skills / skilled / unskilled
 * Filter tabs: ALL / SKILLED / UNSKILLED
 * Text search.
 * Expand node → matched AIP skill cards with type badge + relevance bar.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 90 s auto-refresh.
 *
 * Intent: "gcask" / "centrality skill" / "node skill" / "influential skills" /
 *         "skill centrality" / "graph skill coverage" / "node ai coverage"
 *   → jarvis:gcask-toggle + TTS brief via buildGcaskScript()
 *
 * Toggle: ◈ GCASK at left:38520, bottom:8, zIndex:108.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const DIM   = "#4A6070";
const BG    = "rgba(3,5,9,0.97)";
const BTN_LEFT   = 38520;
const REFRESH_MS = 90_000;
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── intent exports ────────────────────────────────────────────────────────────

const GCASK_RE =
  /\b(gcask|central(ity)?[\s_-]skill|node[\s_-]skill|influential[\s_-]skill|skill[\s_-]central|graph[\s_-]skill[\s_-]cover|node[\s_-]ai[\s_-]cover)\b/i;

export function isGcaskQuery(t) { return GCASK_RE.test(t || ""); }

export async function buildGcaskScript() {
  const [cRaw, sRaw] = await Promise.allSettled([
    fetch(`${apiBase()}/v1/graph/centrality`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
    fetch(`${apiBase()}/v1/aip/skill`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    }).then((r) => r.json()),
  ]);
  const nodes  = normaliseCentrality(cRaw.status === "fulfilled" ? cRaw.value : []);
  const skills = normaliseSkills(sRaw.status === "fulfilled" ? sRaw.value : []);
  const pairs  = correlate(nodes, skills);
  const skilled   = pairs.filter((p) => p.matches.length >= 1).length;
  const unskilled = pairs.filter((p) => p.matches.length === 0).length;
  const topSkilled = pairs
    .filter((p) => p.matches.length >= 1)
    .slice(0, 3)
    .map((p) => `${p.node.label} → ${p.matches[0]?.s.name || "?"}`)
    .join("; ") || "none";
  return (
    `Assess JARVIS graph centrality vs AIP skill coverage in 2 sentences. ` +
    `${nodes.length} high-centrality graph nodes vs ${skills.length} AIP skills: ` +
    `${skilled} SKILLED (influential node has AI backing), ` +
    `${unskilled} UNSKILLED (no AI skill coverage). ` +
    `Top skilled nodes: ${topSkilled}.`
  );
}

// ─── normalise helpers ─────────────────────────────────────────────────────────

function normaliseArray(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (raw && Array.isArray(raw[k])) return raw[k];
  }
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseCentrality(raw) {
  return normaliseArray(raw, ["nodes", "centrality", "entities"]).map((n, i) => ({
    id:       n.id || n.node_id || n.entity_id || String(i),
    label:    n.label || n.name || n.entity || n.node || `Node ${i}`,
    score:    typeof n.score === "number" ? n.score :
              typeof n.centrality === "number" ? n.centrality :
              typeof n.betweenness === "number" ? n.betweenness : 0,
    type:     n.type || n.entity_type || "unknown",
    keywords: `${n.label || n.name || ""} ${n.type || ""} ${n.description || ""}`.toLowerCase(),
  }));
}

function normaliseSkills(raw) {
  return normaliseArray(raw, ["skills", "aip_skills", "items"]).map((s, i) => ({
    id:       s.id || s.skill_id || String(i),
    name:     s.name || s.title || s.skill_name || `Skill ${i}`,
    type:     s.type || s.skill_type || s.category || "unknown",
    score:    typeof s.score === "number" ? s.score :
              typeof s.performance === "number" ? s.performance :
              typeof s.accuracy === "number" ? s.accuracy : 0,
    desc:     s.description || s.summary || s.content?.slice?.(0, 200) || "",
    tags:     [...(s.tags || []), ...(s.labels || [])].map(String),
    keywords: `${s.name || s.title || ""} ${s.type || ""} ${s.description || ""} ${(s.tags || []).join(" ")}`.toLowerCase(),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(node, skill) {
  const nWords = tokens(`${node.label} ${node.type} ${node.keywords}`);
  const sText  = `${skill.name} ${skill.desc} ${skill.tags.join(" ")} ${skill.type}`.toLowerCase();
  const hits = nWords.filter((w) => sText.includes(w));
  return hits.length / Math.max(nWords.length, 1);
}

function correlate(nodes, skills) {
  return nodes.map((node) => {
    const scored = skills
      .map((s) => ({ s, score: matchScore(node, s) }))
      .filter((x) => x.score > 0.06)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { node, matches: scored };
  });
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 55, background: "rgba(0,0,0,0.3)",
      border: `1px solid ${color}33`, borderRadius: 6,
      padding: "6px 8px", textAlign: "center",
    }}>
      <div style={{ fontSize: 18, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
      <div style={{ fontSize: 9, color: DIM, letterSpacing: 1, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreBar({ score }) {
  const color = score > 0.5 ? GREEN : score > 0.25 ? AMBER : CY;
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, flex: 1 }}>
      <div style={{
        width: `${Math.round(score * 100)}%`, height: "100%",
        background: color, borderRadius: 2, transition: "width 0.4s ease",
      }} />
    </div>
  );
}

function CentralityBar({ score }) {
  const pct = Math.min(100, Math.round(score * 100));
  const color = pct > 66 ? AMBER : pct > 33 ? CY : GREEN;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
      <div style={{ fontSize: 8, color: DIM, width: 28 }}>{pct}%</div>
      <div style={{ flex: 1, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ─── main component ────────────────────────────────────────────────────────────

export default function GraphCentralityAipSkill() {
  const [open, setOpen]           = useState(false);
  const [pairs, setPairs]         = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cRes, sRes] = await Promise.allSettled([
        fetch(`${apiBase()}/v1/graph/centrality`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
        fetch(`${apiBase()}/v1/aip/skill`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
      ]);
      const nodes  = normaliseCentrality(cRes.status === "fulfilled" ? cRes.value : []);
      const skills = normaliseSkills(sRes.status === "fulfilled" ? sRes.value : []);
      setPairs(correlate(nodes, skills));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:gcask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcask-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const skilled   = pairs.filter((p) => p.matches.length >= 1);
  const unskilled = pairs.filter((p) => p.matches.length === 0);

  const visible = pairs
    .filter((p) => {
      if (tab === "SKILLED")   return p.matches.length >= 1;
      if (tab === "UNSKILLED") return p.matches.length === 0;
      return true;
    })
    .filter((p) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        p.node.label.toLowerCase().includes(q) ||
        p.node.type.toLowerCase().includes(q) ||
        p.matches.some((m) => m.s.name.toLowerCase().includes(q))
      );
    });

  async function assess() {
    setAssessing(true);
    try {
      const script = await buildGcaskScript();
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ message: script }),
      });
      const json = await res.json();
      const text =
        json.response || json.reply || json.message || json.content ||
        json.answer || JSON.stringify(json).slice(0, 200);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text } })
      );
    } catch (_) {
      // silently ignore
    } finally {
      setAssessing(false);
    }
  }

  const toggleRow = (id) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Centrality × AIP Skill Coverage (GCASK)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 108,
          background: "rgba(3,5,9,0.85)", border: `1px solid ${AMBER}55`,
          borderRadius: 4, color: AMBER, fontFamily: MONO, fontSize: 9,
          letterSpacing: 1, padding: "3px 7px", cursor: "pointer",
        }}
      >
        ◈ GCASK
        {unskilled.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {unskilled.length}
          </span>
        )}
      </button>
    );
  }

  const TABS = ["ALL", "SKILLED", "UNSKILLED"];
  const tabColor = (t) => {
    if (t === "SKILLED")   return GREEN;
    if (t === "UNSKILLED") return AMBER;
    return CY;
  };

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 200, bottom: 48, zIndex: 108,
      width: 520, maxHeight: "75vh",
      background: BG, border: `1px solid ${AMBER}66`,
      borderRadius: 8, fontFamily: MONO, fontSize: 10,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px", borderBottom: `1px solid ${AMBER}33`,
        background: "rgba(0,0,0,0.4)",
      }}>
        <span style={{ color: AMBER, fontSize: 11, letterSpacing: 2 }}>
          ◈ GRAPH CENTRALITY × AIP SKILL
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "none", border: `1px solid ${CY}66`,
              borderRadius: 4, color: CY, fontFamily: MONO, fontSize: 9,
              letterSpacing: 1, padding: "2px 8px", cursor: "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS COVERAGE"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none", border: "none", color: DIM,
              fontSize: 14, cursor: "pointer", lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="NODES"    value={pairs.length}      color={CY}    />
        <Tile label="SKILLS"   value={
          pairs.length > 0
            ? [...new Set(pairs.flatMap((p) => p.matches.map((m) => m.s.id)))].length
            : 0
        } color={CY} />
        <Tile label="SKILLED"   value={skilled.length}   color={GREEN}  />
        <Tile label="UNSKILLED" value={unskilled.length} color={AMBER}  />
      </div>

      {/* filter tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "0 12px 6px", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? `${tabColor(t)}22` : "none",
              border: `1px solid ${tab === t ? tabColor(t) : DIM}`,
              borderRadius: 3, color: tab === t ? tabColor(t) : DIM,
              fontFamily: MONO, fontSize: 8, letterSpacing: 1,
              padding: "2px 6px", cursor: "pointer",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            flex: 1, minWidth: 80, background: "rgba(0,0,0,0.3)",
            border: `1px solid ${DIM}`, borderRadius: 3,
            color: CY, fontFamily: MONO, fontSize: 9, padding: "2px 6px",
            outline: "none",
          }}
        />
      </div>

      {/* status line */}
      {(loading || error) && (
        <div style={{ padding: "4px 12px", color: error ? "#FF4444" : DIM, fontSize: 9 }}>
          {loading ? "loading…" : `error: ${error}`}
        </div>
      )}

      {/* list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 12px" }}>
        {visible.length === 0 && !loading && (
          <div style={{ color: DIM, fontSize: 9, padding: "8px 0" }}>no results</div>
        )}
        {visible.map(({ node, matches }) => {
          const status = matches.length >= 1 ? "SKILLED" : "UNSKILLED";
          const statusColor = status === "SKILLED" ? GREEN : AMBER;
          const isOpen = expanded[node.id];
          return (
            <div
              key={node.id}
              style={{
                borderBottom: `1px solid ${DIM}22`,
                padding: "6px 0",
                cursor: "pointer",
              }}
              onClick={() => toggleRow(node.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 8, padding: "1px 5px", borderRadius: 3,
                  background: `${statusColor}22`, color: statusColor,
                  letterSpacing: 1, border: `1px solid ${statusColor}44`,
                  flexShrink: 0,
                }}>
                  {status}
                </span>
                <span style={{ color: CY, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {node.label}
                </span>
                <span style={{ color: DIM, fontSize: 8, flexShrink: 0 }}>
                  {node.type}
                </span>
                {matches.length > 0 && (
                  <span style={{
                    background: GREEN, color: "#000",
                    borderRadius: 8, padding: "0 4px", fontSize: 7, fontWeight: 700, flexShrink: 0,
                  }}>
                    {matches.length}
                  </span>
                )}
              </div>
              <CentralityBar score={node.score} />
              {isOpen && matches.length > 0 && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {matches.map(({ s, score }) => {
                    const typeColor = s.type === "unknown" ? DIM : CY;
                    return (
                      <div
                        key={s.id}
                        style={{
                          marginBottom: 5, padding: "5px 8px",
                          background: "rgba(0,200,120,0.04)",
                          border: `1px solid ${GREEN}22`, borderRadius: 4,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          {s.type !== "unknown" && (
                            <span style={{
                              fontSize: 7, padding: "1px 4px", borderRadius: 2,
                              background: `${typeColor}22`, color: typeColor,
                              letterSpacing: 1, border: `1px solid ${typeColor}44`, flexShrink: 0,
                            }}>
                              {s.type.toUpperCase()}
                            </span>
                          )}
                          <span style={{ color: "#ddd", fontSize: 9, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.name}
                          </span>
                          {s.score > 0 && (
                            <span style={{ color: DIM, fontSize: 7, flexShrink: 0 }}>
                              {Math.round(s.score * 100)}%
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ color: DIM, fontSize: 8, width: 52, flexShrink: 0 }}>relevance</span>
                          <ScoreBar score={score} />
                          <span style={{ color: DIM, fontSize: 8, width: 28, textAlign: "right", flexShrink: 0 }}>
                            {Math.round(score * 100)}%
                          </span>
                        </div>
                        {s.desc && (
                          <div style={{ color: DIM, fontSize: 8, marginTop: 3, lineHeight: 1.4 }}>
                            {s.desc.slice(0, 120)}{s.desc.length > 120 ? "…" : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
