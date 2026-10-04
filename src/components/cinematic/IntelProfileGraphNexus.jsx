/**
 * IntelProfileGraphNexus — F106 (IPGCNEX).
 *
 * Parallel-fetches /entities/IntelProfile × /v1/graph/centrality
 * and keyword-correlates each intel profile against the top graph
 * centrality nodes, classifying each profile as:
 *
 *   GRAPH_ACTIVE  — matched ≥2 centrality nodes (high-network profile)
 *   PERIPHERAL    — matched exactly 1 node
 *   DARK          — no graph alignment (intelligence dead weight)
 *
 * Red pulse on DARK count (profiles with no network presence).
 *
 * Layout:
 *   • 4 stat tiles: INTEL PROFILES / GRAPH NODES / GRAPH ACTIVE / DARK
 *   • Network coverage % bar
 *   • Filter tabs: ALL / GRAPH_ACTIVE / PERIPHERAL / DARK
 *   • Text search on profile name / role / category
 *   • Expandable rows → matched centrality nodes with score bars
 *   • ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ IPGCNEX at left:983700, bottom:8, zIndex:130
 * Mounted: App.jsx
 * Wired:   JarvisBrain.jsx via isIpgcnexQuery / buildIpgcnexScript
 *
 * Voice: "ipgcnex" / "intel graph" / "profile graph" /
 *        "graph intel" / "active profile graph" / "dark intel profile" /
 *        "graph centrality intel" / "intel network"
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#FF3D5A";
const GREEN = "#00c878";

const BTN_LEFT   = 983700;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function authHdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function normalise(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function keywords(str = "") {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function profileKeywords(profile) {
  return keywords(
    [profile.name, profile.title, profile.role, profile.nationality,
     profile.category, profile.subject, profile.description,
     ...(profile.aliases || [])].join(" ")
  );
}

function matchNodes(profile, nodes) {
  const pks = profileKeywords(profile);
  if (!pks.length) return [];
  return nodes.filter(node => {
    const nks = keywords(
      [node.id, node.label, node.name, node.type, node.entity_type,
       node.description, node.category].join(" ")
    );
    return pks.some(k => nks.includes(k));
  });
}

function classify(matchCount) {
  if (matchCount >= 2) return "GRAPH_ACTIVE";
  if (matchCount === 1) return "PERIPHERAL";
  return "DARK";
}

const CLASS_ORDER = ["GRAPH_ACTIVE", "PERIPHERAL", "DARK"];
const CLASS_LABEL = {
  GRAPH_ACTIVE: "GRAPH ACTIVE",
  PERIPHERAL:   "PERIPHERAL",
  DARK:         "DARK",
};
const CLASS_COLOR = {
  GRAPH_ACTIVE: GREEN,
  PERIPHERAL:   AMBER,
  DARK:         RED,
};

const PULSE = { animation: "pulse-ipgcnex 1.4s ease-in-out infinite" };

async function fetchData() {
  const base = apiBase();
  const hdr  = authHdr();
  const [rawProfiles, rawCentrality] = await Promise.all([
    fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then(r => r.json()),
    fetch(`${base}/v1/graph/centrality`,   { headers: hdr }).then(r => r.json()),
  ]);

  const profiles = normalise(rawProfiles);
  // centrality response is often { nodes: [...] } or an array
  let nodes = [];
  if (Array.isArray(rawCentrality)) {
    nodes = rawCentrality;
  } else if (rawCentrality && Array.isArray(rawCentrality.nodes)) {
    nodes = rawCentrality.nodes;
  } else if (rawCentrality && Array.isArray(rawCentrality.items)) {
    nodes = rawCentrality.items;
  } else if (rawCentrality && typeof rawCentrality === "object") {
    nodes = Object.values(rawCentrality);
  }

  const rows = profiles.map(profile => {
    const matched = matchNodes(profile, nodes);
    return {
      profile,
      matched,
      cls: classify(matched.length),
    };
  });
  rows.sort((a, b) => CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));
  return { rows, totals: { profiles: profiles.length, nodes: nodes.length } };
}

// ── exported helpers for JarvisBrain ─────────────────────────────────────────

const IPGCNEX_RE =
  /\b(ipgcnex|intel.graph|profile.graph|graph.intel|active.profile.graph|dark.intel.profile|graph.centrality.intel|intel.network|graph.active.profile)\b/i;

export function isIpgcnexQuery(q) {
  return IPGCNEX_RE.test(q || "");
}

export async function buildIpgcnexScript() {
  try {
    const { rows, totals } = await fetchData();
    const active = rows.filter(r => r.cls === "GRAPH_ACTIVE").length;
    const dark   = rows.filter(r => r.cls === "DARK").length;
    const pct = totals.profiles > 0 ? Math.round((active / totals.profiles) * 100) : 0;
    window.dispatchEvent(new CustomEvent("jarvis:ipgcnex-toggle"));
    return (
      `Intel profile graph centrality nexus is open, sir. ` +
      `Of ${totals.profiles} intelligence profiles, ${active} are graph-active ` +
      `(${pct}%) against ${totals.nodes} centrality nodes. ` +
      `${dark} profiles show no network alignment and represent dark intelligence with no graph presence.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:ipgcnex-toggle"));
    return "Intel profile graph data is unavailable at present, sir.";
  }
}

// ── component ─────────────────────────────────────────────────────────────────

export default function IntelProfileGraphNexus() {
  const [open,      setOpen]     = useState(false);
  const [rows,      setRows]     = useState([]);
  const [totals,    setTotals]   = useState({ profiles: 0, nodes: 0 });
  const [filter,    setFilter]   = useState("ALL");
  const [search,    setSearch]   = useState("");
  const [expanded,  setExpanded] = useState(null);
  const [loading,   setLoading]  = useState(false);
  const [assessing, setAssessing]= useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchData();
      setRows(data.rows);
      setTotals(data.totals);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(o => !o);
    window.addEventListener("jarvis:ipgcnex-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ipgcnex-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const active = rows.filter(r => r.cls === "GRAPH_ACTIVE").length;
  const dark   = rows.filter(r => r.cls === "DARK").length;
  const pct = totals.profiles > 0 ? Math.round((active / totals.profiles) * 100) : 0;

  const filtered = rows.filter(r => {
    if (filter !== "ALL" && r.cls !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const pStr = [r.profile.name, r.profile.title, r.profile.role, r.profile.category].join(" ").toLowerCase();
      return pStr.includes(q);
    }
    return true;
  });

  async function assess() {
    setAssessing(true);
    try {
      const snap = rows.slice(0, 8).map(r =>
        `${r.profile.name || r.profile.title || "profile"}: ${CLASS_LABEL[r.cls]} (${r.matched.length} nodes)`
      ).join("; ");
      const prompt =
        `Intel profile graph centrality summary (${totals.profiles} profiles, ${active} graph-active, ${dark} dark): ` +
        snap + `. Provide a 2-sentence assessment of network intelligence coverage and key blind spots.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await res.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      if (answer) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {}
    setAssessing(false);
  }

  const MONO = "'JetBrains Mono','Courier New',monospace";
  const TILE = {
    background: "rgba(0,0,0,0.55)", border: "1px solid rgba(41,231,255,0.2)",
    borderRadius: 6, padding: "8px 10px", minWidth: 80,
  };

  return (
    <>
      {/* ── toggle button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 130,
          background: open ? CY : "rgba(5,8,13,0.82)",
          border: `1px solid ${CY}`,
          color: open ? "#04060A" : CY,
          fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "4px 8px", cursor: "pointer", borderRadius: 4,
          boxShadow: `0 0 12px ${CY}${open ? "" : "44"}`,
        }}
      >
        ◈ IPGCNEX
      </button>

      {open && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          width: "min(820px,94vw)", zIndex: 3000,
          background: "rgba(4,6,10,0.97)", border: `1px solid ${CY}44`,
          borderRadius: 12, padding: "16px 18px",
          backdropFilter: "blur(14px)",
          boxShadow: `0 0 80px ${CY}22`,
          fontFamily: MONO, color: "#DCEBF5",
          maxHeight: "80vh", overflowY: "auto",
        }}>
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 3, textShadow: `0 0 12px ${CY}` }}>
              ◈ INTEL PROFILE × GRAPH CENTRALITY NEXUS
            </span>
            <button onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: "#6E8AA0", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {[
              { label: "INTEL PROFILES", value: totals.profiles, color: CY   },
              { label: "GRAPH NODES",    value: totals.nodes,    color: AMBER },
              { label: "GRAPH ACTIVE",   value: active,          color: GREEN },
              {
                label: "DARK",           value: dark,            color: RED,
                pulse: dark > 0,
              },
            ].map(t => (
              <div key={t.label} style={TILE}>
                <div style={{ fontSize: 7, color: "#6E8AA0", letterSpacing: 2, marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 20, color: t.color, fontWeight: 700, ...(t.pulse ? PULSE : {}) }}>
                  {loading ? "…" : t.value}
                </div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          {totals.profiles > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 8, color: "#6E8AA0" }}>
                <span>NETWORK COVERAGE</span>
                <span style={{ color: pct >= 60 ? GREEN : pct >= 30 ? AMBER : RED }}>{pct}%</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
                <div style={{
                  height: "100%", width: `${pct}%`,
                  background: pct >= 60 ? GREEN : pct >= 30 ? AMBER : RED,
                  borderRadius: 2, transition: "width 0.4s",
                }} />
              </div>
            </div>
          )}

          {/* controls */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {["ALL", ...CLASS_ORDER].map(cls => (
              <button key={cls} onClick={() => setFilter(cls)}
                style={{
                  background: filter === cls ? (CLASS_COLOR[cls] || CY) : "rgba(0,0,0,0.4)",
                  border: `1px solid ${CLASS_COLOR[cls] || CY}`,
                  color: filter === cls ? "#04060A" : (CLASS_COLOR[cls] || CY),
                  fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                  padding: "3px 8px", cursor: "pointer", borderRadius: 3,
                }}>
                {cls === "ALL" ? "ALL" : CLASS_LABEL[cls]}
              </button>
            ))}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="search profiles…"
              style={{
                marginLeft: "auto", background: "rgba(0,0,0,0.4)", border: `1px solid ${CY}44`,
                color: "#DCEBF5", fontFamily: MONO, fontSize: 9, padding: "3px 8px",
                borderRadius: 3, outline: "none", width: 140,
              }} />
            <button onClick={assess} disabled={assessing}
              style={{
                background: assessing ? "rgba(0,0,0,0.4)" : `${CY}22`,
                border: `1px solid ${CY}`, color: CY,
                fontFamily: MONO, fontSize: 8, letterSpacing: 1,
                padding: "3px 10px", cursor: assessing ? "default" : "pointer", borderRadius: 3,
              }}>
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {filtered.map((r, i) => {
              const profile = r.profile;
              const isExp   = expanded === i;
              const clsColor = CLASS_COLOR[r.cls];
              return (
                <div key={profile.id || profile.name || i}
                  style={{ border: `1px solid ${clsColor}33`, borderRadius: 6, overflow: "hidden" }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : i)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
                      cursor: "pointer", background: isExp ? `${clsColor}11` : "transparent",
                    }}>
                    <span style={{
                      fontSize: 7, color: clsColor, border: `1px solid ${clsColor}`,
                      padding: "1px 5px", borderRadius: 3, letterSpacing: 1, whiteSpace: "nowrap",
                    }}>
                      {CLASS_LABEL[r.cls]}
                    </span>
                    <span style={{ fontSize: 10, color: "#DCEBF5", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {profile.name || profile.title || profile.id || "Intel profile"}
                    </span>
                    {profile.role && (
                      <span style={{ fontSize: 7, color: "#6E8AA0" }}>{profile.role}</span>
                    )}
                    <span style={{ fontSize: 8, color: CY }}>{r.matched.length} nodes</span>
                    <span style={{ fontSize: 9, color: "#6E8AA0" }}>{isExp ? "▴" : "▾"}</span>
                  </div>

                  {isExp && (
                    <div style={{ padding: "8px 12px", borderTop: `1px solid ${clsColor}22`, background: "rgba(0,0,0,0.3)" }}>
                      {r.matched.length > 0 ? (
                        <div>
                          <div style={{ fontSize: 7, color: CY, letterSpacing: 2, marginBottom: 4 }}>MATCHED GRAPH NODES</div>
                          {r.matched.slice(0, 6).map((node, ni) => {
                            const score = typeof node.score === "number" ? node.score :
                                          typeof node.centrality === "number" ? node.centrality : 0.5;
                            const barW = Math.round(Math.min(score * 100, 100));
                            return (
                              <div key={ni} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <div style={{ flex: 1, fontSize: 9, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {node.label || node.name || node.id || "node"}
                                </div>
                                {node.entity_type && (
                                  <span style={{ fontSize: 7, color: "#6E8AA0" }}>{node.entity_type}</span>
                                )}
                                <div style={{ width: 60, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
                                  <div style={{ width: `${barW || 55}%`, height: "100%", background: CY, borderRadius: 2 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: "#6E8AA0" }}>
                          No graph centrality nodes align with this intel profile — this profile is dark to the network.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && !loading && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 10, padding: 20 }}>
                {rows.length === 0 ? "Loading intel profile data…" : "No profiles match the current filter."}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse-ipgcnex {
          0%,100% { opacity:1; transform:scale(1); }
          50%      { opacity:.55; transform:scale(1.12); }
        }
      `}</style>
    </>
  );
}
