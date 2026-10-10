/**
 * F75 – Graph Network Topology Health Monitor (GNETHLTH)
 * Synthesises /v1/graph/centrality + /v1/graph/communities + /v1/cinematic/brain
 * into a single network health score (0–100).
 *
 * Metrics:
 *   Hub Dominance  – % of total centrality held by top-10% of nodes (high = concentration risk)
 *   Community Balance – coefficient of variation of cluster sizes (high = imbalanced)
 *   Isolation Rate  – % of nodes with centrality < 0.05 (orphaned / barely connected)
 *   Synapse Density – synapses / nodes ratio from /v1/cinematic/brain
 *
 * Health score = mean of (100 − hub_pct) + (100 − isolation_pct) + density_score + balance_score
 *               scaled to 0–100
 *
 * Colour: green ≥ 75 / amber 40–74 / red < 40
 * ASSESS → /v1/jarvis/agent/chat + TTS
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const BTN_LEFT   = 957040;
const Z          = 657;
const REFRESH_MS = 120_000;

const GR   = "#00c878";
const AM   = "#F5A623";
const RD   = "#FF3B3B";
const CY   = "#29E7FF";
const DIM  = "#3a5060";
const MONO = "'JetBrains Mono', 'Courier New', monospace";
const SANS = "'Inter', system-ui, sans-serif";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
function authHdr() { return { Authorization: `Bearer ${API_KEY}` }; }

function scoreColor(s) {
  if (s >= 75) return GR;
  if (s >= 40) return AM;
  return RD;
}

function scoreLabel(s) {
  if (s >= 75) return "HEALTHY";
  if (s >= 40) return "DEGRADED";
  return "CRITICAL";
}

function cv(arr) {
  if (!arr.length) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  if (mean === 0) return 0;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance) / mean;
}

function computeMetrics(centralities, communities, brain) {
  // centralities: [{name, score}] (score 0–1)
  const scores = centralities.map(n => Number(n.score || n.centrality || 0));
  const total  = scores.reduce((a, b) => a + b, 0) || 1;
  const sorted = [...scores].sort((a, b) => b - a);
  const topN   = Math.max(1, Math.ceil(sorted.length * 0.1));
  const topSum = sorted.slice(0, topN).reduce((a, b) => a + b, 0);
  const hubPct = total > 0 ? (topSum / total) * 100 : 0;

  const isolated    = scores.filter(s => s < 0.05).length;
  const isolPct     = scores.length > 0 ? (isolated / scores.length) * 100 : 0;

  // communities: [{id, members, size}]
  const sizes      = communities.map(c => Number(c.member_count || c.size || (Array.isArray(c.members) ? c.members.length : 1)));
  const cvVal      = cv(sizes);
  const balancePct = Math.max(0, 100 - cvVal * 100);

  const nodes     = Number(brain?.node_count || brain?.nodes || centralities.length || 0);
  const synapses  = Number(brain?.synapse_count || brain?.synapses || 0);
  const density   = nodes > 0 ? Math.min(100, (synapses / nodes) * 10) : 0;

  const health = Math.round(
    ((100 - hubPct) * 0.3 + (100 - isolPct) * 0.3 + balancePct * 0.2 + density * 0.2)
  );

  return {
    health: Math.max(0, Math.min(100, health)),
    hubPct: Math.round(hubPct),
    isolPct: Math.round(isolPct),
    balancePct: Math.round(balancePct),
    density: Math.round(density),
    nodeCount: nodes,
    synapseCount: synapses,
    communityCount: communities.length,
    topHubs: centralities.slice(0, 8),
    communities: communities.slice(0, 8),
  };
}

async function loadAll(base) {
  const [cr, cor, br] = await Promise.all([
    fetch(`${base}/v1/graph/centrality`,  { headers: authHdr() }),
    fetch(`${base}/v1/graph/communities`, { headers: authHdr() }),
    fetch(`${base}/v1/cinematic/brain`,   { headers: authHdr() }),
  ]);
  const [cd, cod, bd] = await Promise.all([
    cr.ok  ? cr.json()  : [],
    cor.ok ? cor.json() : [],
    br.ok  ? br.json()  : {},
  ]);
  const centralities  = Array.isArray(cd)  ? cd  : cd.data  || cd.nodes  || cd.items  || [];
  const communities   = Array.isArray(cod) ? cod : cod.data || cod.communities || cod.items || [];
  const brain         = Array.isArray(bd)  ? {}  : bd;
  return { centralities, communities, brain };
}

// ─── exported helpers for JarvisBrain ────────────────────────────────────────
export function isGnethlthQuery(q) {
  return /\b(gnethlth|graph\s+topology|network\s+health|topology\s+(score|health|monitor)|graph\s+health|hub\s+risk|network\s+topology|graph\s+network\s+health|topology\s+analysis)\b/i.test(q);
}

export async function buildGnethlthScript() {
  try {
    const base = apiBase();
    const { centralities, communities, brain } = await loadAll(base);
    const m = computeMetrics(centralities, communities, brain);
    return `Graph topology health: score ${m.health}/100 (${scoreLabel(m.health)}). ` +
      `${m.nodeCount} nodes, ${m.synapseCount} synapses, ${m.communityCount} communities. ` +
      `Hub dominance ${m.hubPct}%, isolation rate ${m.isolPct}%, community balance ${m.balancePct}%, synapse density score ${m.density}/100. ` +
      (m.health < 40
        ? `Network is critically unhealthy — high hub concentration or isolation detected.`
        : m.health < 75
          ? `Network is degraded. Review hub concentration and isolated nodes.`
          : `Network topology is healthy.`);
  } catch (_) {
    return "Graph topology health status unavailable.";
  }
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function GraphTopologyHealth() {
  const [open, setOpen]       = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("OVERVIEW");
  const timerRef              = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const base = apiBase();
      const { centralities, communities, brain } = await loadAll(base);
      setMetrics(computeMetrics(centralities, communities, brain));
    } catch (e) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:gnethlth-toggle", handler);
    return () => window.removeEventListener("jarvis:gnethlth-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const assess = useCallback(async () => {
    if (!metrics) return;
    const script = await buildGnethlthScript();
    try {
      const base = apiBase();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Assess the following graph topology health report and provide recommendations:\n${script}` }),
      });
      const d = r.ok ? await r.json() : {};
      const reply = d.response || d.message || script;
      const voice = getActiveVoice ? getActiveVoice() : "ash";
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: { ...authHdr(), "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.slice(0, 500), voice }),
      });
    } catch (_) {}
  }, [metrics]);

  if (!open) {
    const score = metrics?.health ?? null;
    const col   = score !== null ? scoreColor(score) : CY;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Graph Network Topology Health (GNETHLTH)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z,
          background: "rgba(0,20,30,0.85)", border: `1px solid ${col}`,
          color: col, fontFamily: MONO, fontSize: 10, padding: "3px 8px",
          cursor: "pointer", borderRadius: 3, whiteSpace: "nowrap",
        }}
      >
        ◈ GNETHLTH{score !== null ? ` ${score}` : ""}
      </button>
    );
  }

  const m    = metrics;
  const col  = m ? scoreColor(m.health) : CY;
  const tabs = ["OVERVIEW", "HUBS", "CLUSTERS"];

  return (
    <div style={{
      position: "fixed", top: 60, right: 20, zIndex: Z + 1000,
      width: 480, maxHeight: "80vh", overflowY: "auto",
      background: "rgba(0,14,22,0.97)", border: `1px solid ${col}`,
      borderRadius: 8, fontFamily: SANS, color: "#cde",
      boxShadow: `0 0 32px ${col}33`,
    }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", borderBottom: `1px solid ${DIM}` }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: col, letterSpacing: 1 }}>
          ◈ GRAPH TOPOLOGY HEALTH
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={assess} disabled={!m} style={{
            background: "transparent", border: `1px solid ${col}`,
            color: col, fontFamily: MONO, fontSize: 9, padding: "2px 8px",
            cursor: m ? "pointer" : "default", borderRadius: 3,
          }}>▶ ASSESS</button>
          <button onClick={load} style={{
            background: "transparent", border: `1px solid ${DIM}`, color: "#888",
            fontFamily: MONO, fontSize: 9, padding: "2px 6px", cursor: "pointer", borderRadius: 3,
          }}>↺</button>
          <button onClick={() => setOpen(false)} style={{
            background: "transparent", border: "none", color: "#666",
            fontSize: 16, cursor: "pointer", lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {loading && !m && (
        <div style={{ padding: 20, textAlign: "center", color: "#556", fontFamily: MONO, fontSize: 11 }}>
          LOADING GRAPH DATA…
        </div>
      )}
      {error && (
        <div style={{ padding: 12, color: RD, fontFamily: MONO, fontSize: 10 }}>ERR: {error}</div>
      )}

      {m && (
        <>
          {/* health score ring area */}
          <div style={{ padding: "16px 14px 8px", display: "flex", alignItems: "center", gap: 20 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 36, color: col, lineHeight: 1 }}>{m.health}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: col, marginTop: 2 }}>/100</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: col, marginTop: 4,
                            border: `1px solid ${col}`, borderRadius: 3, padding: "1px 6px" }}>
                {scoreLabel(m.health)}
              </div>
            </div>
            {/* stat tiles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, flex: 1 }}>
              {[
                { label: "NODES",      val: m.nodeCount,      c: CY },
                { label: "SYNAPSES",   val: m.synapseCount,   c: CY },
                { label: "CLUSTERS",   val: m.communityCount, c: GR },
                { label: "HUB DOM %",  val: `${m.hubPct}%`,  c: m.hubPct > 60 ? RD : m.hubPct > 35 ? AM : GR },
                { label: "ISOLATION%", val: `${m.isolPct}%`, c: m.isolPct > 30 ? RD : m.isolPct > 10 ? AM : GR },
                { label: "DENSITY",    val: `${m.density}`,   c: m.density > 60 ? GR : m.density > 30 ? AM : RD },
              ].map(({ label, val, c }) => (
                <div key={label} style={{
                  background: "rgba(255,255,255,0.03)", borderRadius: 4, padding: "5px 8px",
                  border: `1px solid ${DIM}`,
                }}>
                  <div style={{ fontSize: 9, color: "#556", fontFamily: MONO }}>{label}</div>
                  <div style={{ fontSize: 14, color: c, fontFamily: MONO, marginTop: 1 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* metric bars */}
          <div style={{ padding: "4px 14px 10px" }}>
            {[
              { label: "Hub Dominance (low = healthy)", val: m.hubPct, good: false },
              { label: "Isolation Rate (low = healthy)", val: m.isolPct, good: false },
              { label: "Community Balance",              val: m.balancePct, good: true },
              { label: "Synapse Density",                val: m.density, good: true },
            ].map(({ label, val, good }) => {
              const barCol = good
                ? (val >= 75 ? GR : val >= 40 ? AM : RD)
                : (val <= 20 ? GR : val <= 50 ? AM : RD);
              return (
                <div key={label} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                                fontSize: 10, color: "#778", marginBottom: 2 }}>
                    <span>{label}</span>
                    <span style={{ color: barCol, fontFamily: MONO }}>{val}%</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                    <div style={{ height: 4, width: `${val}%`, background: barCol, borderRadius: 2,
                                  transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${DIM}`, padding: "0 14px" }}>
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: MONO, fontSize: 10, padding: "6px 10px",
                color: tab === t ? col : "#556",
                borderBottom: tab === t ? `2px solid ${col}` : "2px solid transparent",
              }}>{t}</button>
            ))}
          </div>

          {tab === "OVERVIEW" && (
            <div style={{ padding: "10px 14px", fontSize: 11, color: "#889", lineHeight: 1.6 }}>
              <p style={{ margin: "0 0 6px" }}>
                Health score is a weighted composite: hub dominance (30%), isolation rate (30%),
                community balance (20%), synapse density (20%).
              </p>
              {m.health < 40 && (
                <p style={{ margin: 0, color: RD, fontFamily: MONO, fontSize: 10 }}>
                  ⚠ CRITICAL — network topology shows severe imbalance or isolation.
                </p>
              )}
              {m.health >= 40 && m.health < 75 && (
                <p style={{ margin: 0, color: AM, fontFamily: MONO, fontSize: 10 }}>
                  ⚠ DEGRADED — review hub concentration and isolated nodes.
                </p>
              )}
              {m.health >= 75 && (
                <p style={{ margin: 0, color: GR, fontFamily: MONO, fontSize: 10 }}>
                  ✓ HEALTHY — network topology within normal parameters.
                </p>
              )}
            </div>
          )}

          {tab === "HUBS" && (
            <div style={{ padding: "8px 14px" }}>
              {m.topHubs.length === 0 ? (
                <div style={{ color: "#445", fontSize: 11, padding: 8 }}>No centrality data.</div>
              ) : m.topHubs.map((n, i) => {
                const s = Number(n.score || n.centrality || 0);
                return (
                  <div key={n.name || i} style={{
                    padding: "6px 0", borderBottom: `1px solid ${DIM}`,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span style={{ fontSize: 10, color: "#445", fontFamily: MONO, width: 18 }}>
                      {i + 1}.
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: CY, overflow: "hidden",
                                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {n.name || n.entity || n.id || "—"}
                      </div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginTop: 3 }}>
                        <div style={{ height: 3, width: `${Math.min(100, s * 100)}%`,
                                      background: s > 0.7 ? RD : s > 0.4 ? AM : CY,
                                      borderRadius: 2 }} />
                      </div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 10, color: s > 0.7 ? RD : s > 0.4 ? AM : CY,
                                   width: 36, textAlign: "right" }}>
                      {(s * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {tab === "CLUSTERS" && (
            <div style={{ padding: "8px 14px" }}>
              {m.communities.length === 0 ? (
                <div style={{ color: "#445", fontSize: 11, padding: 8 }}>No community data.</div>
              ) : m.communities.map((c, i) => {
                const size = Number(c.member_count || c.size || (Array.isArray(c.members) ? c.members.length : 1));
                const topMember = Array.isArray(c.members) ? c.members[0] : (c.top_member || c.id || "—");
                return (
                  <div key={c.id || i} style={{
                    padding: "6px 0", borderBottom: `1px solid ${DIM}`,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                                  fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: GR }}>
                        Cluster {c.id ?? i + 1}
                        {topMember && topMember !== (c.id || "—") &&
                          <span style={{ color: "#556", fontSize: 9, marginLeft: 6 }}>
                            top: {String(topMember).slice(0, 24)}
                          </span>}
                      </span>
                      <span style={{ color: CY, fontFamily: MONO, fontSize: 10 }}>
                        {size} members
                      </span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                      <div style={{ height: 3,
                                    width: `${Math.min(100, (size / (m.nodeCount || 1)) * 100 * 4)}%`,
                                    background: GR, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ padding: "6px 14px 10px",
                        fontSize: 9, color: "#334", fontFamily: MONO, textAlign: "right" }}>
            AUTO-REFRESH {REFRESH_MS / 1000}s · /v1/graph/centrality + /v1/graph/communities + /v1/cinematic/brain
          </div>
        </>
      )}
    </div>
  );
}
