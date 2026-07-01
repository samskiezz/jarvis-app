/**
 * GraphTopologyHealth (F44) — composite graph topology health monitor.
 *
 * Parallel-polls /v1/graph/centrality + /v1/graph/communities every 90 s.
 * Computes a 0–100 health score:
 *   • Concentration penalty  (top node holds too much centrality = fragile)
 *   • Community diversity bonus  (more balanced clusters = healthier)
 *
 * Panel shows: score ring, key stat tiles, 15-bar sparkline history (localStorage),
 * and an "ASSESS" button → /v1/jarvis/agent/chat + TTS narrative.
 *
 * Toggle: ⬡ GTOPO button at bottom left:9340.
 * Voice: "graph topology" / "network topology" / "topology health" / "gtopo"
 *
 * Exports: isGtopoQuery, buildGtopoScript  (wired into JarvisBrain).
 * Additive only — mounted via App.jsx; does NOT touch CinematicShell/Home/Loader.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CY   = "#29E7FF";
const GRN  = "#00c878";
const AMB  = "#e8a800";
const RED  = "#e8203c";
const MONO = "'JetBrains Mono',monospace";

const POLL_MS     = 90_000;
const LS_KEY      = "jarvis:gtopo:history";
const MAX_HISTORY = 15;

// ── Intent helpers exported for JarvisBrain ────────────────────────────────
export function isGtopoQuery(q) {
  return /\b(graph\s*topolog|network\s*topolog|topolog.*health|graph\s*health|network\s*health|topo\s*health|gtopo)\b/i.test(
    q || ""
  );
}

export async function buildGtopoScript() {
  try {
    const [cResp, commResp] = await Promise.all([
      fetch(`${apiBase()}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/graph/communities`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const cData    = await cResp.json();
    const commData = await commResp.json();

    const nodes  = normaliseNodes(cData);
    const nComm  = commData?.n_clusters ?? Object.keys(commData?.communities ?? {}).length ?? 0;
    const { score, concentration } = computeScore(nodes, nComm);
    const top = nodes[0];
    const topName = top?.label ?? top?.name ?? top?.id ?? "unknown";

    return (
      `Graph topology health score is ${score} out of 100, sir. ` +
      `The network has ${nodes.length} ranked node${nodes.length !== 1 ? "s" : ""} across ` +
      `${nComm} communit${nComm !== 1 ? "ies" : "y"}. ` +
      `Centrality concentration is ${concentration}% — ` +
      (concentration >= 50
        ? `critically high; the top node "${topName}" dominates the network, making it fragile.`
        : concentration >= 25
        ? `elevated; consider distributing influence more evenly.`
        : `healthy; influence is well distributed across the graph.`)
    );
  } catch (_) {
    return "Graph topology health monitoring is active, sir. Fetching live centrality and community data now.";
  }
}

// ── Data helpers ───────────────────────────────────────────────────────────
function normaliseNodes(d) {
  const arr = Array.isArray(d)
    ? d
    : Array.isArray(d?.centrality)
    ? d.centrality
    : Array.isArray(d?.nodes)
    ? d.nodes
    : Array.isArray(d?.data)
    ? d.data
    : [];
  return arr
    .map((n) => ({ ...n, _score: n.score ?? n.centrality_score ?? n.value ?? n.degree ?? 0 }))
    .sort((a, b) => b._score - a._score);
}

function computeScore(nodes, nClusters) {
  if (!nodes.length) return { score: 50, concentration: 0 };
  const totalScore = nodes.reduce((s, n) => s + n._score, 0) || 1;
  const topScore   = nodes[0]?._score ?? 0;
  const concentration = Math.round((topScore / totalScore) * 100);
  const concentrationPenalty = Math.min(50, concentration * 0.9);
  const diversityBonus       = Math.min(50, (nClusters ?? 0) * 5);
  const raw = 50 - concentrationPenalty + diversityBonus;
  return { score: Math.max(0, Math.min(100, Math.round(raw))), concentration };
}

function scoreColor(s) {
  if (s >= 70) return GRN;
  if (s >= 40) return AMB;
  return RED;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch (_) {
    return [];
  }
}

function saveHistory(h) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(h.slice(-MAX_HISTORY)));
  } catch (_) {}
}

// ── Component ──────────────────────────────────────────────────────────────
export default function GraphTopologyHealth() {
  const [visible, setVisible]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [snapshot, setSnapshot]   = useState(null); // { score, concentration, nodes, nClusters, ts }
  const [history, setHistory]     = useState(loadHistory);
  const [assessing, setAssessing] = useState(false);
  const [aiText, setAiText]       = useState("");
  const timerRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const [cResp, commResp] = await Promise.all([
        fetch(`${apiBase()}/v1/graph/centrality`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/graph/communities`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [cData, commData] = await Promise.all([cResp.json(), commResp.json()]);

      const nodes      = normaliseNodes(cData);
      const nClusters  = commData?.n_clusters ?? Object.keys(commData?.communities ?? {}).length ?? 0;
      const { score, concentration } = computeScore(nodes, nClusters);
      const ts = Date.now();

      const snap = { score, concentration, nodes, nClusters, ts };
      setSnapshot(snap);
      setError(null);

      setHistory((prev) => {
        const next = [...prev, { score, ts }].slice(-MAX_HISTORY);
        saveHistory(next);
        return next;
      });
    } catch (e) {
      setError("Unreachable");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    poll().finally(() => setLoading(false));
    timerRef.current = setInterval(poll, POLL_MS);
    return () => clearInterval(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const h = () => setVisible((v) => !v);
    window.addEventListener("jarvis:gtopo-toggle", h);
    return () => window.removeEventListener("jarvis:gtopo-toggle", h);
  }, []);

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setAiText("");
    try {
      const prompt = snapshot
        ? `Graph topology health score: ${snapshot.score}/100. ` +
          `Nodes: ${snapshot.nodes.length}. Communities: ${snapshot.nClusters}. ` +
          `Centrality concentration: ${snapshot.concentration}%. ` +
          `Top node: ${snapshot.nodes[0]?.label ?? snapshot.nodes[0]?.id ?? "unknown"}. ` +
          `Assess the graph's structural resilience and recommend one action.`
        : "Assess the current JARVIS knowledge graph topology health and structural resilience.";
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const answer =
        d?.response ?? d?.message ?? d?.text ?? d?.answer ?? "Assessment complete.";
      setAiText(answer);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: answer } })
      );
    } catch (_) {
      setAiText("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const color     = snapshot ? scoreColor(snapshot.score) : CY;
  const maxH      = Math.max(...history.map((h) => h.score), 1);
  const lastTs    = snapshot
    ? new Date(snapshot.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
  const topNode   = snapshot?.nodes?.[0];
  const topName   = topNode?.label ?? topNode?.name ?? topNode?.id ?? "—";

  return (
    <>
      {/* ── Toggle button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setVisible((v) => !v)}
        title="Graph Topology Health (F44)"
        style={{
          position: "fixed", bottom: 8, left: 9340, zIndex: 60,
          background: visible ? color : "rgba(5,8,13,0.7)",
          border: `1px solid ${color}55`,
          color: visible ? "#04060A" : color,
          borderRadius: 4, padding: "2px 7px",
          fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, cursor: "pointer",
          boxShadow: snapshot && snapshot.score < 40 ? `0 0 12px ${RED}88` : "none",
        }}
      >
        ⬡ GTOPO
        {snapshot && (
          <span style={{
            marginLeft: 4, background: color, color: "#04060A",
            borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {snapshot.score}
          </span>
        )}
      </button>

      {/* ── Panel ──────────────────────────────────────────────────────── */}
      {visible && (
        <div style={{
          position: "fixed", bottom: 36, left: 9220, zIndex: 65,
          width: 340, background: "rgba(5,10,18,0.92)",
          border: `1px solid ${color}44`,
          borderTop: `2px solid ${color}`,
          borderRadius: 10, padding: "12px 14px",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 40px ${color}22`,
          fontFamily: MONO, color: "#d0e8f4",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <span style={{ color, fontSize: 13 }}>⬡</span>
            <span style={{ color, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              GRAPH TOPOLOGY HEALTH
            </span>
            <button
              onClick={() => setVisible(false)}
              style={{ marginLeft: "auto", background: "none", border: "none", color: "#4a6070", cursor: "pointer", fontSize: 12 }}
            >✕</button>
          </div>

          {loading && !snapshot ? (
            <div style={{ color: "#4a6070", fontSize: 10, letterSpacing: 1 }}>LOADING…</div>
          ) : error ? (
            <div style={{ color: RED, fontSize: 10, letterSpacing: 1 }}>{error}</div>
          ) : snapshot ? (
            <>
              {/* Score ring (SVG) */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                <svg width={96} height={96} style={{ display: "block" }}>
                  <circle cx={48} cy={48} r={40} fill="none" stroke={`${color}22`} strokeWidth={8} />
                  <circle
                    cx={48} cy={48} r={40}
                    fill="none"
                    stroke={color}
                    strokeWidth={8}
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - snapshot.score / 100)}`}
                    transform="rotate(-90 48 48)"
                    style={{ transition: "stroke-dashoffset 0.6s ease" }}
                  />
                  <text x={48} y={44} textAnchor="middle" fill={color}
                    style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700 }}>
                    {snapshot.score}
                  </text>
                  <text x={48} y={60} textAnchor="middle" fill="#4a6070"
                    style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1 }}>
                    /100
                  </text>
                </svg>
              </div>

              {/* Stat tiles */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                {[
                  { label: "NODES",   value: snapshot.nodes.length },
                  { label: "CLUSTERS", value: snapshot.nClusters },
                  { label: "CONC %",  value: `${snapshot.concentration}%`,
                    color: snapshot.concentration >= 50 ? RED : snapshot.concentration >= 25 ? AMB : GRN },
                  { label: "TOP NODE", value: topName.length > 8 ? topName.slice(0, 7) + "…" : topName, small: true },
                ].map(({ label, value, color: c, small }) => (
                  <div key={label} style={{
                    background: "rgba(41,231,255,0.05)", borderRadius: 6,
                    padding: "5px 4px", textAlign: "center",
                    border: "1px solid rgba(41,231,255,0.1)",
                  }}>
                    <div style={{ fontSize: small ? 10 : 13, fontWeight: 700, color: c ?? color }}>{value}</div>
                    <div style={{ fontSize: 7, color: "#4a6070", letterSpacing: 1, marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Sparkline */}
              {history.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 8, color: "#4a6070", letterSpacing: 1, marginBottom: 4 }}>
                    SCORE HISTORY ({history.length} readings)
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 36 }}>
                    {history.map((h, i) => {
                      const barH = Math.max(4, Math.round((h.score / maxH) * 32));
                      const isLast = i === history.length - 1;
                      const bc     = scoreColor(h.score);
                      return (
                        <div key={i} title={`Score ${h.score} @ ${new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                          style={{
                            flex: 1, height: barH,
                            background: isLast ? bc : `${bc}55`,
                            borderRadius: 2,
                            transition: "height 0.4s ease",
                          }}
                        />
                      );
                    })}
                    {Array.from({ length: MAX_HISTORY - history.length }).map((_, i) => (
                      <div key={`pad-${i}`} style={{ flex: 1, height: 4, background: "rgba(41,231,255,0.08)", borderRadius: 2 }} />
                    ))}
                  </div>
                </div>
              )}

              {/* AI assessment */}
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  width: "100%", padding: "6px 0", marginBottom: aiText ? 8 : 0,
                  background: assessing ? "rgba(41,231,255,0.05)" : `${color}18`,
                  border: `1px solid ${color}55`,
                  color: assessing ? "#4a6070" : color,
                  borderRadius: 6, fontFamily: MONO, fontSize: 9, letterSpacing: 2,
                  cursor: assessing ? "default" : "pointer",
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ JARVIS ASSESS TOPOLOGY"}
              </button>

              {aiText && (
                <div style={{
                  fontSize: 10, color: "#c0d8e8", lineHeight: 1.5,
                  background: "rgba(41,231,255,0.04)",
                  border: `1px solid ${color}22`, borderRadius: 6,
                  padding: "6px 8px",
                }}>
                  {aiText}
                </div>
              )}

              <div style={{
                marginTop: 8, fontSize: 8, color: "#4a6070", letterSpacing: 1,
                borderTop: "1px solid rgba(41,231,255,0.06)", paddingTop: 6,
              }}>
                POLLS /v1/graph/centrality + /v1/graph/communities every 90 s · refreshed {lastTs}
              </div>
            </>
          ) : null}
        </div>
      )}
    </>
  );
}
