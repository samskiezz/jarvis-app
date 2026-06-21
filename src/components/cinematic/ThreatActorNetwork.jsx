/**
 * ThreatActorNetwork — F84.
 *
 * Cross-references /entities/IntelProfile threat actors with
 * /v1/graph/centrality influence scores, producing a ranked composite
 * "network danger index": actors with both high threat level AND high
 * graph centrality rise to the top.
 *
 * Composite score = (threatWeight × 0.55) + (centralityScore × 0.45)
 *   where threatWeight: CRITICAL→100, HIGH→75, MEDIUM→50, LOW→25, unknown→0
 *   and   centralityScore is the node's raw centrality value (0–1) × 100.
 *
 * Stat tiles: actors · matched in graph · critical-danger count · avg score.
 * Filter tabs: ALL / CRITICAL (≥80) / HIGH (60-79) / MEDIUM (<60).
 * Click ▶ ASSESS → /v1/jarvis/agent/chat AI 2-sentence actor assessment + TTS.
 * 60 s auto-refresh.
 *
 * Intent: "threat actor" / "actor network" / "threat network" / "influence threat" /
 *         "network danger" / "who is most dangerous" / "tan" / "actor influence"
 *   → jarvis:tan-toggle + TTS brief via buildThreatActorNetworkScript()
 *
 * Toggle: ◈ TAN at left:7460, zIndex 65. Badge: red count of CRITICAL actors.
 * Mounted in App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY     = "#29E7FF";
const RED    = "#FF3B6B";
const AMBER  = "#F5A623";
const PURPLE = "#A855F7";
const GREEN  = "#00c878";

const BTN_LEFT   = 7460;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.items)) return raw.items;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object") return Object.values(raw);
  return [];
}

function threatWeight(profile) {
  const tl = String(
    profile.threat_level || profile.threatLevel || profile.classification ||
    profile.clearance || profile.level || ""
  ).toUpperCase();
  if (["CRITICAL", "EXTREME", "TOP SECRET", "TS"].includes(tl)) return 100;
  if (["HIGH", "SECRET", "S"].includes(tl)) return 75;
  if (["MEDIUM", "MODERATE", "CONFIDENTIAL", "C"].includes(tl)) return 50;
  if (["LOW", "UNCLASSIFIED", "U"].includes(tl)) return 25;
  // fall back to numeric severity
  const sv = profile.severity || profile.severity_level || 0;
  if (typeof sv === "number" && sv > 0) return Math.min(100, sv);
  return 0;
}

function threatLabel(tw) {
  if (tw >= 100) return "CRITICAL";
  if (tw >= 75)  return "HIGH";
  if (tw >= 50)  return "MEDIUM";
  if (tw >= 25)  return "LOW";
  return "UNKNOWN";
}

function threatColor(tw) {
  if (tw >= 100) return RED;
  if (tw >= 75)  return AMBER;
  if (tw >= 50)  return CY;
  return GREEN;
}

function compositeScore(tw, centralityPct) {
  return Math.round(tw * 0.55 + centralityPct * 0.45);
}

function normaliseCentralityNodes(raw) {
  // /v1/graph/centrality may return { nodes: [...] } or just an array
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.nodes)) return raw.nodes;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  return [];
}

// Match a profile name against a graph node by id/label/name
function findCentralityNode(profile, nodes) {
  const pname = (profile.name || profile.label || profile.title || "").toLowerCase();
  const pid   = String(profile.id || "").toLowerCase();
  return nodes.find((n) => {
    const nid    = String(n.id || "").toLowerCase();
    const nlabel = (n.label || n.name || "").toLowerCase();
    return nid === pid || nlabel === pname ||
      (pname.length > 2 && nlabel.includes(pname)) ||
      (pname.length > 2 && pname.includes(nlabel));
  }) || null;
}

// ─── exported intent helpers (consumed by JarvisBrain) ───────────────────────

const TAN_RE =
  /threat.{0,12}actor|actor.{0,12}network|threat.{0,12}network|influence.{0,12}threat|network.{0,12}danger|who.{0,20}dangerous|most.{0,10}dangerous|\btan\b|actor.{0,12}influenc/i;

export function isThreatActorNetworkQuery(q) {
  return TAN_RE.test(q || "");
}

export async function buildThreatActorNetworkScript() {
  try {
    const [rawProfiles, rawCentrality] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
      fetch(`${apiBase()}/v1/graph/centrality`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()),
    ]);

    const profiles = normaliseArray(rawProfiles);
    const nodes    = normaliseCentralityNodes(rawCentrality);

    const actors = profiles.map((p) => {
      const tw = threatWeight(p);
      const node = findCentralityNode(p, nodes);
      const centralityRaw = node ? (node.centrality || node.score || node.value || 0) : 0;
      const centralityPct = Math.min(100, Math.round(
        typeof centralityRaw === "number" ? centralityRaw * 100 : Number(centralityRaw) * 100
      ));
      const score = compositeScore(tw, centralityPct);
      return { name: p.name || p.label || p.id || "Unknown", tw, centralityPct, score, matched: !!node };
    });

    actors.sort((a, b) => b.score - a.score);
    const critical = actors.filter((a) => a.score >= 80).length;
    const matched  = actors.filter((a) => a.matched).length;
    const top      = actors[0];

    window.dispatchEvent(new CustomEvent("jarvis:tan-toggle"));
    return `Threat Actor Network online, sir. ${profiles.length} intel profiles cross-referenced against ${nodes.length} graph nodes; ${matched} actors matched. The most network-dangerous actor is ${top?.name || "unknown"} with a composite danger index of ${top?.score ?? 0}. ${critical} actor${critical === 1 ? "" : "s"} classified as critical — review the panel immediately.`;
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:tan-toggle"));
    return "Threat Actor Network is online, sir. Cross-referencing intel profiles against the graph centrality map now.";
  }
}

// ─── component ────────────────────────────────────────────────────────────────

export default function ThreatActorNetwork() {
  const [visible, setVisible]     = useState(false);
  const [actors, setActors]       = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState("ALL");
  const [assessing, setAssessing] = useState(null);
  const pollRef = useRef(null);

  const fetchData = useCallback(async () => {
    const [rawProfiles, rawCentrality] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()).catch(() => []),
      fetch(`${apiBase()}/v1/graph/centrality`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }).then((r) => r.json()).catch(() => []),
    ]);

    const profiles = normaliseArray(rawProfiles);
    const nodes    = normaliseCentralityNodes(rawCentrality);

    const result = profiles.map((p) => {
      const tw = threatWeight(p);
      const node = findCentralityNode(p, nodes);
      const centralityRaw = node ? (node.centrality || node.score || node.value || 0) : 0;
      const centralityPct = Math.min(100, Math.round(
        typeof centralityRaw === "number" ? centralityRaw * 100 : Number(centralityRaw) * 100
      ));
      const score = compositeScore(tw, centralityPct);
      return {
        id: String(p.id || p.name || Math.random()),
        name: p.name || p.label || p.title || "Unknown Actor",
        type: p.type || p.actor_type || p.category || "",
        tw,
        centralityPct,
        score,
        matched: !!node,
        raw: p,
      };
    });

    result.sort((a, b) => b.score - a.score);
    setActors(result);
  }, []);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:tan-toggle", onToggle);
    return () => window.removeEventListener("jarvis:tan-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!visible) { clearInterval(pollRef.current); return; }
    setLoading(true);
    fetchData().finally(() => setLoading(false));
    pollRef.current = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(pollRef.current);
  }, [visible, fetchData]);

  async function assess(actor) {
    setAssessing(actor.id);
    const prompt = `As JARVIS, provide a 2-sentence threat assessment for the actor "${actor.name}". Their composite network danger index is ${actor.score}/100 (threat weight ${actor.tw}, graph centrality ${actor.centralityPct}%). Note whether this actor warrants immediate attention and what their network influence implies operationally.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() ||
        `Assessment of ${actor.name} is unavailable at this time, sir.`;
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } }));
    } catch {
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", {
          detail: { text: `Threat assessment for ${actor.name} is temporarily unavailable, sir.` },
        })
      );
    }
    setAssessing(null);
  }

  const critical = actors.filter((a) => a.score >= 80).length;
  const matched  = actors.filter((a) => a.matched).length;
  const top      = actors[0];

  const filtered =
    tab === "CRITICAL" ? actors.filter((a) => a.score >= 80)
    : tab === "HIGH"   ? actors.filter((a) => a.score >= 60 && a.score < 80)
    : tab === "MEDIUM" ? actors.filter((a) => a.score < 60)
    : actors;

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Threat Actor Network (F84)"
        style={{
          position: "fixed", bottom: 6, left: BTN_LEFT, zIndex: 65,
          background: visible ? `${RED}22` : "rgba(5,8,13,0.75)",
          border: `1px solid ${visible ? RED : RED}44`,
          color: visible ? RED : `${RED}99`,
          borderRadius: 4, padding: "3px 7px",
          fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
          letterSpacing: 1, cursor: "pointer", whiteSpace: "nowrap",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ TAN
        {critical > 0 && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0 4px", fontSize: 7, fontWeight: "bold",
            animation: "jpulse 1.4s ease-in-out infinite",
          }}>{critical}</span>
        )}
      </button>

      {visible && (
        <div style={{
          position: "fixed", bottom: 32, left: BTN_LEFT - 320, zIndex: 65,
          width: 600, maxHeight: "74vh", overflowY: "auto",
          background: "rgba(6,11,18,0.93)",
          border: `1px solid ${RED}44`,
          borderRadius: 10, padding: "14px 16px",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${RED}18`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color: RED, fontSize: 11, letterSpacing: 2 }}>◈ THREAT ACTOR NETWORK</span>
            <button
              onClick={() => { setLoading(true); fetchData().finally(() => setLoading(false)); }}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${RED}33`, borderRadius: 3,
                color: `${RED}88`, padding: "2px 6px", fontSize: 7,
                cursor: "pointer", letterSpacing: 1,
              }}
            >↻ REFRESH</button>
            <button
              onClick={() => setVisible(false)}
              style={{ background: "transparent", border: "none", color: "#445566", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginBottom: 10 }}>
            {[
              ["ACTORS",     loading ? "…" : actors.length, CY],
              ["IN GRAPH",   loading ? "…" : matched, PURPLE],
              ["CRITICAL",   loading ? "…" : critical, RED],
              ["TOP THREAT", loading ? "…" : (top?.name?.slice(0, 10) || "—"), AMBER],
            ].map(([label, val, col]) => (
              <div key={label} style={{
                background: `${col}0d`, border: `1px solid ${col}33`,
                borderRadius: 5, padding: "6px 8px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: "bold",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
                <div style={{ color: "#445566", fontSize: 8, letterSpacing: 1, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {[["ALL", CY], ["CRITICAL ≥80", RED], ["HIGH 60-79", AMBER], ["MEDIUM <60", GREEN]].map(([t, col]) => {
              const key = t.split(" ")[0];
              return (
                <button
                  key={t}
                  onClick={() => setTab(key)}
                  style={{
                    background: tab === key ? `${col}22` : "transparent",
                    border: `1px solid ${tab === key ? col : "#1e3040"}`,
                    color: tab === key ? col : "#445566",
                    borderRadius: 4, padding: "3px 10px",
                    fontFamily: "'JetBrains Mono',monospace", fontSize: 8,
                    letterSpacing: 1, cursor: "pointer",
                  }}
                >{t}</button>
              );
            })}
          </div>

          {/* Actor rows */}
          {loading && actors.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              cross-referencing intel profiles with graph centrality…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ color: "#445566", fontSize: 10, textAlign: "center", padding: "24px 0" }}>
              No actors match this filter.
            </div>
          ) : (
            filtered.map((actor, idx) => {
              const col = threatColor(actor.tw);
              const label = threatLabel(actor.tw);
              return (
                <div key={actor.id} style={{
                  background: actor.score >= 80 ? `${RED}08` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${col}22`,
                  borderLeft: `3px solid ${col}`,
                  borderRadius: 6, padding: "10px 12px", marginBottom: 8,
                  animation: actor.score >= 90 ? "jpulse 2s ease-in-out infinite" : "none",
                }}>
                  {/* Row header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ color: "#445566", fontSize: 8, width: 18, textAlign: "right", flexShrink: 0 }}>#{idx + 1}</span>
                    <span style={{ color: "#DCEBF5", fontSize: 11, fontWeight: "bold", flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{actor.name}</span>
                    <span style={{
                      fontSize: 7, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                    }}>{label}</span>
                    <span style={{
                      fontSize: 9, color: col, fontWeight: "bold", flexShrink: 0,
                    }}>{actor.score}</span>
                    <button
                      onClick={() => assess(actor)}
                      disabled={assessing === actor.id}
                      style={{
                        background: assessing === actor.id ? "#1a2530" : `${col}18`,
                        color: assessing === actor.id ? "#445566" : col,
                        border: `1px solid ${col}44`,
                        borderRadius: 3, padding: "2px 8px",
                        fontFamily: "'JetBrains Mono',monospace", fontSize: 7,
                        letterSpacing: 1, cursor: assessing === actor.id ? "default" : "pointer", flexShrink: 0,
                      }}
                    >{assessing === actor.id ? "…" : "▶ ASSESS"}</button>
                  </div>

                  {/* Composite danger bar */}
                  <div style={{
                    height: 5, background: "rgba(255,255,255,0.06)",
                    borderRadius: 3, overflow: "hidden", marginBottom: 6,
                  }}>
                    <div style={{
                      height: "100%", width: `${actor.score}%`,
                      background: `linear-gradient(90deg, ${col}88, ${col})`,
                      borderRadius: 3, transition: "width 0.6s ease",
                    }} />
                  </div>

                  {/* Sub-scores */}
                  <div style={{ display: "flex", gap: 16, fontSize: 8, color: "#556677" }}>
                    <span>threat <span style={{ color: col }}>{actor.tw}</span></span>
                    <span>graph centrality <span style={{ color: PURPLE }}>{actor.centralityPct}%</span></span>
                    {actor.type && <span>type <span style={{ color: "#7A8F9E" }}>{actor.type}</span></span>}
                    {!actor.matched && (
                      <span style={{ color: "#334455" }}>not in graph</span>
                    )}
                  </div>
                </div>
              );
            })
          )}

          <div style={{ marginTop: 8, color: "#223344", fontSize: 7, textAlign: "right" }}>
            /entities/IntelProfile × /v1/graph/centrality · composite = threat×0.55 + centrality×0.45 · 60 s auto-refresh
          </div>
        </div>
      )}
    </>
  );
}
