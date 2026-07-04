/**
 * GraphCommunityRiskHeatmap — F127.
 *
 * Parallel-fetches /v1/graph/communities + /entities/RiskSignal and
 * keyword-correlates each network cluster (community label + member IDs)
 * against active risk signals to surface which graph communities are
 * under the greatest threat pressure.
 *
 * Cluster risk score: sum of severity-weighted signal matches
 *   CRITICAL=4 · HIGH=3 · MEDIUM=2 · LOW=1, normalised to 0–100.
 * Tiers: HOT(≥60) · ELEVATED(30–60) · MODERATE(10–30) · SAFE(<10)
 *
 * Stat tiles:   communities / signals / hot clusters / safe clusters
 * Filter tabs:  ALL | HOT | ELEVATED | MODERATE | SAFE + text search
 * Expand row:   matched risk signals with severity badge + relevance score
 * Red badge:    on HOT community count
 * ▶ ASSESS:     /v1/jarvis/agent/chat 2-sentence network-threat brief
 *               + TTS via jarvis:speak-dossier
 *
 * Toggle:  ◈ GCRHM  left:39080  bottom:8  zIndex:81
 * Event:   jarvis:gcrhm-toggle
 * Voice:   "graph community risk" / "community threat" / "network heatmap" /
 *          "hot clusters" / "gcrhm"
 * Refresh: 90 s auto-refresh while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const GREEN  = "#00c878";
const AMBER  = "#F5A623";
const ORANGE = "#FF8800";
const RED    = "#FF3D5A";
const BTN_LEFT = 39080;
const POLL_MS  = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── severity helpers ─────────────────────────────────────────────────────────

const SEV_WEIGHT = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const SEV_ORDER  = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

function sevWeight(s) {
  return SEV_WEIGHT[String(s || "").toUpperCase()] ?? 1;
}
function sevColor(s) {
  const u = String(s || "").toUpperCase();
  if (u === "CRITICAL") return RED;
  if (u === "HIGH")     return ORANGE;
  if (u === "MEDIUM")   return AMBER;
  if (u === "LOW")      return GREEN;
  return "#6E8AA0";
}

// ─── tier helpers ─────────────────────────────────────────────────────────────

function tier(score) {
  if (score >= 60) return "HOT";
  if (score >= 30) return "ELEVATED";
  if (score >= 10) return "MODERATE";
  return "SAFE";
}
function tierColor(t) {
  if (t === "HOT")      return RED;
  if (t === "ELEVATED") return ORANGE;
  if (t === "MODERATE") return AMBER;
  return GREEN;
}

// ─── data normalisers ─────────────────────────────────────────────────────────

function normaliseCommunities(raw) {
  // API returns { communities: { entityId: clusterId, ... }, n_clusters, count }
  const mapping =
    raw?.communities && typeof raw.communities === "object"
      ? raw.communities
      : typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : {};
  const map = {};
  for (const [entityId, clusterId] of Object.entries(mapping)) {
    const key = String(clusterId);
    if (!map[key]) map[key] = [];
    map[key].push(entityId);
  }
  return Object.entries(map)
    .map(([id, members]) => ({ id, members, size: members.length }))
    .sort((a, b) => b.size - a.size);
}

function normaliseSignals(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)          ? raw.data
    : Array.isArray(raw?.items)         ? raw.items
    : Array.isArray(raw?.results)       ? raw.results
    : Array.isArray(raw?.risk_signals)  ? raw.risk_signals
    : [];
  return arr.map((s, i) => ({
    id:          s.id          || String(i),
    title:       s.title       || s.name        || `Signal ${i + 1}`,
    description: String(s.description || s.summary || s.details || "").slice(0, 300),
    severity:    s.severity    || s.level        || s.risk_level || "UNKNOWN",
    type:        s.type        || s.signal_type  || s.category   || "",
    tags:        Array.isArray(s.tags) ? s.tags.join(" ") : String(s.tags || ""),
  }));
}

// ─── keyword correlation ──────────────────────────────────────────────────────

function tokenize(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@()[\]{}+]+/)
    .filter((w) => w.length >= 3);
}

function communityRelevance(community, signal) {
  // Tokenize member IDs (e.g. "Investment_GlobalFund" → ["investment", "globalfund"])
  const memberTokens = new Set(community.members.flatMap(tokenize));
  // Tokenize signal text
  const sigTokens = tokenize(
    `${signal.title} ${signal.description} ${signal.type} ${signal.tags}`
  );
  if (!memberTokens.size || !sigTokens.length) return 0;
  const hits = sigTokens.filter((t) => memberTokens.has(t)).length;
  return Math.min(100, Math.round((hits / Math.max(memberTokens.size, sigTokens.length)) * 300));
}

function buildHeatmap(communities, signals) {
  const result = [];
  for (const c of communities) {
    const matched = [];
    let weightedSum = 0;
    for (const s of signals) {
      const score = communityRelevance(c, s);
      if (score > 0) {
        matched.push({ signal: s, score });
        weightedSum += score * sevWeight(s.severity);
      }
    }
    matched.sort((a, b) => b.score - a.score);
    // Normalise to 0-100; dampen by community size to avoid tiny clusters dominating
    const riskScore = matched.length
      ? Math.min(100, Math.round(weightedSum / Math.max(1, c.size) * 2))
      : 0;
    result.push({ ...c, matched, riskScore, tier: tier(riskScore) });
  }
  return result.sort((a, b) => b.riskScore - a.riskScore);
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isGcrhmQuery(q) {
  return /graph\s*communit.*risk|community\s*threat|network\s*heatmap|hot\s*cluster|gcrhm\b/i.test(q || "");
}

export async function buildGcrhmScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [cRes, sRes] = await Promise.all([
      fetch(`${base}/v1/graph/communities`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
    ]);
    const communities = normaliseCommunities(cRes.ok ? await cRes.json() : {});
    const signals     = normaliseSignals(sRes.ok ? await sRes.json() : []);
    const heatmap     = buildHeatmap(communities, signals);
    const hot         = heatmap.filter((c) => c.tier === "HOT").length;
    window.dispatchEvent(new CustomEvent("jarvis:gcrhm-toggle"));
    if (!communities.length)
      return "Graph community risk heatmap is standing by, sir. No community data available yet.";
    return (
      `Graph community risk heatmap active, sir. ` +
      `${communities.length} network cluster${communities.length !== 1 ? "s" : ""} cross-referenced against ` +
      `${signals.length} active risk signal${signals.length !== 1 ? "s" : ""}. ` +
      `${hot} cluster${hot !== 1 ? "s are" : " is"} in the HOT tier — indicating concentrated threat exposure. ` +
      `${heatmap.filter((c) => c.tier === "SAFE").length} cluster${heatmap.filter((c) => c.tier === "SAFE").length !== 1 ? "s" : ""} remain${heatmap.filter((c) => c.tier === "SAFE").length !== 1 ? "" : "s"} clear.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:gcrhm-toggle"));
    return "Graph community risk heatmap is standing by, sir.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function GraphCommunityRiskHeatmap() {
  const [visible,    setVisible]    = useState(false);
  const [heatmap,    setHeatmap]    = useState([]);
  const [sigCount,   setSigCount]   = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("all");
  const [selected,   setSelected]   = useState(null);
  const [aiText,     setAiText]     = useState("");
  const [aiLoading,  setAiLoading]  = useState(false);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [cRes, sRes] = await Promise.all([
        fetch(`${base}/v1/graph/communities`, { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,  { headers: hdr }),
      ]);
      const communities = normaliseCommunities(cRes.ok ? await cRes.json() : {});
      const signals     = normaliseSignals(sRes.ok ? await sRes.json() : []);
      setSigCount(signals.length);
      setHeatmap(buildHeatmap(communities, signals));
    } catch (_) {}
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:gcrhm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:gcrhm-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function runAssessment(community) {
    if (aiLoading) return;
    setAiLoading(true);
    setAiText("");
    const topSignals = community.matched.slice(0, 3).map((m) => m.signal.title).join(", ");
    const prompt =
      `As JARVIS, provide a 2-sentence network-threat assessment for graph community cluster ${community.id} ` +
      `(${community.size} member nodes, risk score ${community.riskScore}/100, tier: ${community.tier}). ` +
      (community.matched.length
        ? `Top correlated risk signals: ${topSignals}. `
        : "No direct risk signal correlations detected. ") +
      `Assess the threat exposure of this network cluster and recommend the next defensive action.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAiText(answer);
      if (answer)
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch (_) {
      setAiText("Reasoning core unreachable.");
    } finally {
      setAiLoading(false);
    }
  }

  const hotCount = heatmap.filter((c) => c.tier === "HOT").length;

  const filtered = heatmap.filter((c) => {
    if (filter === "hot"      && c.tier !== "HOT")      return false;
    if (filter === "elevated" && c.tier !== "ELEVATED")  return false;
    if (filter === "moderate" && c.tier !== "MODERATE")  return false;
    if (filter === "safe"     && c.tier !== "SAFE")      return false;
    if (search) {
      const s = search.toLowerCase();
      const text = [
        `cluster ${c.id}`,
        ...c.members.slice(0, 20),
        ...c.matched.map((m) => m.signal.title),
      ].join(" ").toLowerCase();
      if (!text.includes(s)) return false;
    }
    return true;
  });

  const TABS = [
    { key: "all",      label: "ALL" },
    { key: "hot",      label: "HOT",      color: RED    },
    { key: "elevated", label: "ELEVATED", color: ORANGE },
    { key: "moderate", label: "MODERATE", color: AMBER  },
    { key: "safe",     label: "SAFE",     color: GREEN  },
  ];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Graph Community × Risk Signal Network Heatmap"
        style={{
          position:     "fixed",
          bottom:       8,
          left:         BTN_LEFT,
          zIndex:       81,
          height:       26,
          padding:      "0 8px",
          background:   visible ? `${RED}22` : "rgba(8,14,22,0.82)",
          border:       `1px solid ${visible ? RED : "#2A3A4A"}`,
          borderRadius: 5,
          color:        visible ? RED : "#6E8AA0",
          fontFamily:   "'JetBrains Mono', monospace",
          fontSize:     10,
          letterSpacing: 1,
          cursor:       "pointer",
          whiteSpace:   "nowrap",
        }}
      >
        {hotCount > 0 && !visible && (
          <span
            style={{
              display:      "inline-block",
              marginRight:  5,
              background:   RED,
              color:        "#000",
              borderRadius: "50%",
              width:        14,
              height:       14,
              fontSize:     9,
              lineHeight:   "14px",
              textAlign:    "center",
              fontWeight:   700,
            }}
          >
            {hotCount > 9 ? "9+" : hotCount}
          </span>
        )}
        ◈ GCRHM
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position:      "fixed",
            bottom:        44,
            left:          Math.min(BTN_LEFT, window.innerWidth - 660),
            zIndex:        81,
            width:         640,
            maxHeight:     "78vh",
            display:       "flex",
            flexDirection: "column",
            background:    "rgba(4,10,18,0.96)",
            border:        `1px solid ${RED}44`,
            borderTop:     `2px solid ${RED}`,
            borderRadius:  12,
            boxShadow:     `0 0 40px ${RED}14, 0 8px 32px rgba(0,0,0,0.75)`,
            fontFamily:    "'JetBrains Mono', monospace",
            overflow:      "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display:      "flex",
              alignItems:   "center",
              gap:          10,
              padding:      "10px 14px",
              borderBottom: `1px solid ${RED}22`,
              flexShrink:   0,
            }}
          >
            <span style={{ color: RED, fontSize: 13 }}>◈</span>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              GRAPH COMMUNITY RISK HEATMAP
            </span>
            {loading && (
              <span style={{ marginLeft: "auto", color: "#6E8AA0", fontSize: 10 }}>loading…</span>
            )}
            <button
              onClick={() => setVisible(false)}
              style={{
                marginLeft:  loading ? 0 : "auto",
                background:  "transparent",
                border:      "none",
                color:       "#6E8AA0",
                cursor:      "pointer",
                fontSize:    16,
                lineHeight:  1,
              }}
            >
              ×
            </button>
          </div>

          {/* Stat tiles */}
          <div
            style={{
              display:      "flex",
              gap:          8,
              padding:      "8px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink:   0,
            }}
          >
            {[
              { label: "CLUSTERS",  val: heatmap.length,                                                   col: CY     },
              { label: "SIGNALS",   val: sigCount,                                                          col: "#A78BFA" },
              { label: "HOT",       val: hotCount,                                                          col: RED    },
              { label: "SAFE",      val: heatmap.filter((c) => c.tier === "SAFE").length,                  col: GREEN  },
            ].map((t) => (
              <div
                key={t.label}
                style={{
                  flex:          1,
                  background:    `${t.col}11`,
                  border:        `1px solid ${t.col}33`,
                  borderRadius:  6,
                  padding:       "5px 8px",
                  textAlign:     "center",
                }}
              >
                <div style={{ color: t.col, fontSize: 16, fontWeight: 700 }}>{t.val}</div>
                <div style={{ color: "#4A6A7A", fontSize: 9, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div
            style={{
              display:      "flex",
              gap:          6,
              padding:      "6px 14px",
              borderBottom: "1px solid #1A2A3A",
              flexShrink:   0,
              flexWrap:     "wrap",
              alignItems:   "center",
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                style={{
                  padding:      "2px 8px",
                  border:       `1px solid ${filter === tab.key ? (tab.color || CY) : "#2A3A4A"}`,
                  borderRadius: 4,
                  background:   filter === tab.key ? `${tab.color || CY}18` : "transparent",
                  color:        filter === tab.key ? (tab.color || CY) : "#6E8AA0",
                  fontSize:     9,
                  cursor:       "pointer",
                  letterSpacing: 1,
                }}
              >
                {tab.label}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search clusters…"
              style={{
                marginLeft:   "auto",
                background:   "rgba(255,255,255,0.04)",
                border:       "1px solid #2A3A4A",
                borderRadius: 4,
                color:        "#C0D8E8",
                fontSize:     10,
                padding:      "3px 8px",
                outline:      "none",
                width:        130,
              }}
            />
          </div>

          {/* Community rows */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {filtered.length === 0 && !loading && (
              <div style={{ color: "#4A6A7A", fontSize: 11, textAlign: "center", padding: 24 }}>
                No clusters match the current filter.
              </div>
            )}
            {filtered.map((c) => {
              const isOpen = selected?.id === c.id;
              const tColor = tierColor(c.tier);
              return (
                <div key={c.id} style={{ borderBottom: "1px solid #0E1E2E" }}>
                  {/* Cluster row */}
                  <div
                    onClick={() => setSelected(isOpen ? null : c)}
                    style={{
                      display:     "flex",
                      alignItems:  "center",
                      gap:         8,
                      padding:     "7px 14px",
                      cursor:      "pointer",
                      background:  isOpen ? `${tColor}0A` : "transparent",
                    }}
                  >
                    {/* Tier badge */}
                    <span
                      style={{
                        background:   `${tColor}22`,
                        border:       `1px solid ${tColor}55`,
                        borderRadius: 3,
                        color:        tColor,
                        fontSize:     8,
                        padding:      "1px 5px",
                        letterSpacing: 1,
                        minWidth:     56,
                        textAlign:    "center",
                      }}
                    >
                      {c.tier}
                    </span>

                    {/* Cluster label */}
                    <span style={{ color: "#C0D8E8", fontSize: 11, flex: 1 }}>
                      Cluster {c.id}
                      <span style={{ color: "#4A6A7A", fontSize: 9, marginLeft: 6 }}>
                        ({c.size} node{c.size !== 1 ? "s" : ""})
                      </span>
                    </span>

                    {/* Risk score bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div
                        style={{
                          width:        80,
                          height:       4,
                          background:   "#1A2A3A",
                          borderRadius: 2,
                          overflow:     "hidden",
                        }}
                      >
                        <div
                          style={{
                            width:        `${c.riskScore}%`,
                            height:       "100%",
                            background:   tColor,
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span style={{ color: tColor, fontSize: 10, minWidth: 28, textAlign: "right" }}>
                        {c.riskScore}
                      </span>
                    </div>

                    {/* Signal count */}
                    <span style={{ color: "#6E8AA0", fontSize: 9, minWidth: 30, textAlign: "right" }}>
                      {c.matched.length} sig
                    </span>

                    <span style={{ color: "#4A6A7A", fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div
                      style={{
                        padding:      "0 14px 10px 14px",
                        background:   `${tColor}06`,
                      }}
                    >
                      {/* Member preview */}
                      <div style={{ color: "#4A6A7A", fontSize: 9, marginBottom: 6 }}>
                        MEMBERS (preview):{" "}
                        <span style={{ color: "#6E8AA0" }}>
                          {c.members.slice(0, 8).join(" · ")}
                          {c.members.length > 8 && ` +${c.members.length - 8} more`}
                        </span>
                      </div>

                      {/* Matched signals */}
                      {c.matched.length === 0 ? (
                        <div style={{ color: GREEN, fontSize: 10, marginBottom: 8 }}>
                          ✓ No risk signal correlations detected.
                        </div>
                      ) : (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ color: "#4A6A7A", fontSize: 9, marginBottom: 4 }}>
                            CORRELATED RISK SIGNALS
                          </div>
                          {c.matched.slice(0, 6).map((m) => (
                            <div
                              key={m.signal.id}
                              style={{
                                display:      "flex",
                                alignItems:   "center",
                                gap:          8,
                                padding:      "3px 0",
                                borderBottom: "1px solid #0E1E2E",
                              }}
                            >
                              <span
                                style={{
                                  background:   `${sevColor(m.signal.severity)}22`,
                                  border:       `1px solid ${sevColor(m.signal.severity)}55`,
                                  borderRadius: 3,
                                  color:        sevColor(m.signal.severity),
                                  fontSize:     8,
                                  padding:      "1px 4px",
                                  minWidth:     52,
                                  textAlign:    "center",
                                }}
                              >
                                {m.signal.severity.toUpperCase()}
                              </span>
                              <span style={{ color: "#C0D8E8", fontSize: 10, flex: 1 }}>
                                {m.signal.title}
                              </span>
                              <div
                                style={{
                                  width:        50,
                                  height:       3,
                                  background:   "#1A2A3A",
                                  borderRadius: 2,
                                  overflow:     "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width:        `${m.score}%`,
                                    height:       "100%",
                                    background:   sevColor(m.signal.severity),
                                  }}
                                />
                              </div>
                              <span style={{ color: "#6E8AA0", fontSize: 9, minWidth: 26, textAlign: "right" }}>
                                {m.score}%
                              </span>
                            </div>
                          ))}
                          {c.matched.length > 6 && (
                            <div style={{ color: "#4A6A7A", fontSize: 9, marginTop: 4 }}>
                              +{c.matched.length - 6} more signals correlated
                            </div>
                          )}
                        </div>
                      )}

                      {/* AI assessment button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); runAssessment(c); }}
                        disabled={aiLoading}
                        style={{
                          padding:      "4px 10px",
                          background:   `${tColor}18`,
                          border:       `1px solid ${tColor}44`,
                          borderRadius: 4,
                          color:        aiLoading ? "#6E8AA0" : tColor,
                          fontSize:     9,
                          cursor:       aiLoading ? "not-allowed" : "pointer",
                          letterSpacing: 1,
                          marginBottom: aiText ? 6 : 0,
                        }}
                      >
                        {aiLoading ? "⟳ ASSESSING…" : "▶ JARVIS ASSESS CLUSTER"}
                      </button>

                      {aiText && (
                        <div
                          style={{
                            marginTop:    6,
                            padding:      "7px 10px",
                            background:   "rgba(255,255,255,0.03)",
                            border:       `1px solid ${tColor}22`,
                            borderRadius: 6,
                            color:        "#C0D8E8",
                            fontSize:     10,
                            lineHeight:   1.6,
                          }}
                        >
                          {aiText}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div
            style={{
              padding:     "5px 14px",
              borderTop:   "1px solid #1A2A3A",
              color:       "#3A5A6A",
              fontSize:    9,
              flexShrink:  0,
            }}
          >
            {`/v1/graph/communities × /entities/RiskSignal · ${POLL_MS / 1000}s auto-refresh`}
          </div>
        </div>
      )}
    </>
  );
}
