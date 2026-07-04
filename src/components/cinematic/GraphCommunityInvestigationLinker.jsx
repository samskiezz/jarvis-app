/**
 * GraphCommunityInvestigationLinker — F142.
 *
 * Parallel-fetches /v1/graph/communities + /v1/investigations then
 * keyword-correlates each network cluster (label + member node IDs/names)
 * against open investigations (title/description/subject/tags) to surface:
 *   INVESTIGATED — at least one open investigation covers this cluster.
 *   BLIND        — no investigative focus on this cluster (coverage gap).
 *
 * Stat tiles: clusters / investigations / investigated / blind
 * Filter tabs: ALL / INVESTIGATED / BLIND + text search
 * Expand cluster → matched investigations with status badge + relevance score.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence network-investigation brief
 *   + jarvis:speak-dossier TTS.
 * 90 s auto-refresh.
 *
 * Intent: "graph community investigation" / "cluster investigation" /
 *         "which clusters have cases" / "blind clusters" / "gcil"
 *   → jarvis:gcil-toggle + TTS brief via buildGcilScript()
 *
 * Toggle: ◈ GCIL at left:46360, bottom:8, zIndex 94.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const AMBER  = "#F5A623";
const GREEN  = "#00c878";
const PURPLE = "#A78BFA";
const BTN_LEFT   = 46360;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise helpers ────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items))      return raw.items;
  if (raw && Array.isArray(raw.data))       return raw.data;
  if (raw && Array.isArray(raw.results))    return raw.results;
  if (raw && Array.isArray(raw.communities)) return raw.communities;
  if (raw && typeof raw === "object")       return Object.values(raw);
  return [];
}

function normaliseCommunities(raw) {
  return normaliseArray(raw).map((c, i) => ({
    id:      c.id ?? c.community_id ?? `community-${i}`,
    label:   c.label ?? c.name ?? c.community_label ?? `Cluster ${i + 1}`,
    size:    c.size ?? c.member_count ?? (Array.isArray(c.members) ? c.members.length : 0),
    members: [
      ...(Array.isArray(c.members)      ? c.members      : []),
      ...(Array.isArray(c.node_ids)     ? c.node_ids     : []),
      ...(Array.isArray(c.member_nodes) ? c.member_nodes : []),
    ].map(String),
    tags: [...(c.tags || []), ...(c.categories || [])].map(String),
  }));
}

function normaliseInvestigations(raw) {
  return normaliseArray(raw).map((inv) => ({
    id:          inv.id || inv.case_id || String(Math.random()),
    title:       inv.title || inv.name || inv.subject || "Untitled Investigation",
    description: inv.description || inv.summary || inv.details || "",
    status:      inv.status || inv.state || "",
    subject:     inv.subject || inv.target || "",
    tags:        [...(inv.tags || []), ...(inv.labels || [])].map(String),
  }));
}

function tokens(str) {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function matchScore(community, investigation) {
  const invText = `${investigation.title} ${investigation.description} ${investigation.subject} ${investigation.tags.join(" ")}`.toLowerCase();
  const words = [
    ...tokens(community.label),
    ...community.members.flatMap(tokens),
    ...community.tags.flatMap(tokens),
  ];
  return words.reduce((acc, w) => acc + (invText.includes(w) ? 1 : 0), 0);
}

function correlate(communities, investigations) {
  return communities.map((c) => {
    const matched = investigations
      .map((inv) => ({ ...inv, _score: matchScore(c, inv) }))
      .filter((inv) => inv._score > 0)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);
    return { ...c, matched };
  });
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const GCIL_RE =
  /graph[\s-]?community[\s-]?invest|cluster[\s-]?invest|which[\s-]?clusters?[\s-]?have[\s-]?cases?|blind[\s-]?clusters?|gcil\b/i;

export function isGcilQuery(q) {
  return GCIL_RE.test(q || "");
}

export async function buildGcilScript() {
  try {
    const [commRaw, invRaw] = await Promise.all([
      fetch(`${apiBase()}/v1/graph/communities`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);
    const communities    = normaliseCommunities(commRaw);
    const investigations = normaliseInvestigations(invRaw);
    const corr           = correlate(communities, investigations);
    const investigated   = corr.filter((c) => c.matched.length > 0);
    const blind          = corr.filter((c) => c.matched.length === 0);
    return `Graph community investigation coverage active, sir. ${communities.length} network cluster${communities.length !== 1 ? "s" : ""} cross-referenced against ${investigations.length} open investigation${investigations.length !== 1 ? "s" : ""}. ${investigated.length} cluster${investigated.length !== 1 ? "s have" : " has"} active investigative coverage. ${blind.length} cluster${blind.length !== 1 ? "s are" : " is"} operating without any case focus — potential intelligence blind spots. Select any cluster to review matched investigations and request an AI network-investigation assessment.`;
  } catch (_) {
    return "Graph community investigation linker is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

const STATUS_COLOUR = (s) => {
  const sl = (s || "").toLowerCase();
  if (sl === "open" || sl === "active" || sl === "in_progress") return CY;
  if (sl === "closed" || sl === "resolved")                     return GREEN;
  if (sl === "investigating")                                    return AMBER;
  return "#445566";
};

export default function GraphCommunityInvestigationLinker() {
  const [visible, setVisible]     = useState(false);
  const [communities, setCommunities] = useState([]);
  const [investigations, setInvestigations] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const [commRaw, invRaw] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/communities`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }).then((r) => r.json()),
      ]);
      setCommunities(normaliseCommunities(commRaw));
      setInvestigations(normaliseInvestigations(invRaw));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:gcil-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcil-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assessCluster(c) {
    setAssessing(c.id);
    const caseList = c.matched.map((inv) => `"${inv.title}"`).join(", ");
    const prompt = `As JARVIS, provide a 2-sentence network-investigation assessment for the graph cluster "${c.label}" (size: ${c.size} nodes). Investigations linked to this cluster: ${caseList || "none"}. Assess whether the current investigative focus on this network cluster is adequate and what the investigative priority should be.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        "Insufficient data to assess this cluster's investigative coverage, sir.";
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", {
        detail: { text: "Cluster investigation assessment unavailable at this time, sir." },
      }));
    }
    setAssessing(null);
  }

  const correlated   = correlate(communities, investigations);
  const investigated = correlated.filter((c) => c.matched.length > 0);
  const blind        = correlated.filter((c) => c.matched.length === 0);

  const base =
    tab === "INVESTIGATED" ? investigated :
    tab === "BLIND"        ? blind        : correlated;

  const displayed = search
    ? base.filter((c) =>
        `${c.label} ${c.members.join(" ")} ${c.tags.join(" ")}`.toLowerCase().includes(search.toLowerCase())
      )
    : base;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Graph Community × Investigation Linker (F142)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 94,
          background: visible ? `${CY}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? CY : `${CY}44`}`,
          color: visible ? CY : `${CY}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ GCIL
        {blind.length > 0 && (
          <span style={{
            marginLeft: 4, background: AMBER, color: "#000",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
          }}>{blind.length}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: Math.max(8, BTN_LEFT - 280), zIndex: 94,
          width: 580, maxHeight: "70vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${CY}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>◈ GRAPH COMMUNITY × INVESTIGATION</span>
            <button onClick={fetchData} style={{
              marginLeft: "auto", background: "transparent",
              border: `1px solid ${CY}33`, borderRadius: 3,
              color: `${CY}88`, padding: "2px 6px", fontSize: 7,
              cursor: "pointer", letterSpacing: 1,
            }}>↻ REFRESH</button>
            <button onClick={() => setVisible(false)} style={{
              background: "transparent", border: "none",
              color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["CLUSTERS",      communities.length,    CY],
              ["CASES",         investigations.length, PURPLE],
              ["INVESTIGATED",  investigated.length,   GREEN],
              ["BLIND",         blind.length,          blind.length > 0 ? AMBER : "#445566"],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "INVESTIGATED", "BLIND"].map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? `${CY}22` : "transparent",
                border: `1px solid ${tab === t ? CY : "#1e3040"}`,
                color: tab === t ? CY : "#445566",
                borderRadius: 4, padding: "3px 10px",
                fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="search clusters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${CY}22`, borderRadius: 4,
              color: "#DCEBF5", padding: "5px 8px",
              fontFamily: "'JetBrains Mono',monospace", fontSize: 9,
              outline: "none", marginBottom: 10,
            }}
          />

          {/* Cluster rows */}
          {loading && displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              correlating network clusters against investigation catalog…
            </div>
          ) : displayed.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "20px 0" }}>
              {tab === "BLIND"
                ? "All network clusters appear to have investigative coverage."
                : "No clusters in this filter."}
            </div>
          ) : (
            displayed.map((c) => {
              const isOpen         = expanded === c.id;
              const isInvestigated = c.matched.length > 0;
              return (
                <div key={c.id} style={{
                  background: "rgba(255,255,255,0.02)",
                  border: `1px solid ${isOpen ? `${CY}44` : "#1a2530"}`,
                  borderLeft: `3px solid ${isInvestigated ? GREEN : AMBER}`,
                  borderRadius: 6, padding: "8px 10px", marginBottom: 6,
                  cursor: "pointer",
                }} onClick={() => setExpanded(isOpen ? null : c.id)}>
                  {/* Cluster header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ color: "#DCEBF5", fontSize: 10, fontWeight: "bold" }}>{c.label}</span>
                        <span style={{
                          fontSize: 7, color: PURPLE,
                          border: "1px solid #A78BFA44",
                          borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                        }}>{c.size} nodes</span>
                      </div>
                      {c.members.length > 0 && (
                        <div style={{ color: "#556677", fontSize: 8 }}>
                          {c.members.slice(0, 5).join(" · ").slice(0, 80)}
                          {c.members.length > 5 ? ` +${c.members.length - 5}` : ""}
                        </div>
                      )}
                    </div>
                    <span style={{
                      fontSize: 7, whiteSpace: "nowrap",
                      color: isInvestigated ? GREEN : AMBER,
                      border: `1px solid ${isInvestigated ? GREEN : AMBER}44`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                    }}>
                      {isInvestigated
                        ? `${c.matched.length} case${c.matched.length !== 1 ? "s" : ""}`
                        : "BLIND"}
                    </span>
                  </div>

                  {/* Assess button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); assessCluster(c); }}
                      disabled={assessing === c.id}
                      style={{
                        background: assessing === c.id ? "#1a2530" : `${CY}18`,
                        color: assessing === c.id ? "#445566" : CY,
                        border: `1px solid ${CY}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === c.id ? "default" : "pointer",
                      }}
                    >{assessing === c.id ? "…assessing" : "▶ ASSESS"}</button>
                  </div>

                  {/* Expanded investigation list */}
                  {isOpen && isInvestigated && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${CY}18` }}>
                      {c.matched.map((inv) => {
                        const sc = STATUS_COLOUR(inv.status);
                        return (
                          <div key={inv.id} style={{
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid #1e3040",
                            borderRadius: 4, padding: "6px 8px", marginBottom: 4,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                              {inv.status && (
                                <span style={{
                                  fontSize: 7, color: sc,
                                  border: `1px solid ${sc}44`,
                                  borderRadius: 3, padding: "1px 5px", letterSpacing: 1,
                                  textTransform: "uppercase", flexShrink: 0,
                                }}>{inv.status}</span>
                              )}
                              <div style={{ color: "#a0b8cc", fontSize: 10 }}>{inv.title}</div>
                              <div style={{ marginLeft: "auto", fontSize: 7, color: `${CY}66`, whiteSpace: "nowrap" }}>
                                score {inv._score}
                              </div>
                            </div>
                            {inv.description && (
                              <div style={{ color: "#334455", fontSize: 8 }}>
                                {inv.description.slice(0, 100)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isOpen && !isInvestigated && (
                    <div style={{
                      marginTop: 8, paddingTop: 8, borderTop: "1px solid #1a2530",
                      color: AMBER, fontSize: 8,
                    }}>
                      ⚠ No active investigations are focused on this network cluster. This community may represent an intelligence blind spot.
                    </div>
                  )}
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /v1/graph/communities + /v1/investigations · 90 s auto-refresh · ▶ ASSESS for AI network-investigation brief
          </div>
        </div>
      )}
    </>
  );
}
