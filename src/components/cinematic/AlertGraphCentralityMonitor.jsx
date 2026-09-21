/**
 * F124 — Alert × Graph Centrality Monitor (AGCM)
 *
 * Parallel-fetches /v1/alerts and /v1/graph/centrality every 60 s.
 * Keyword-correlates each active alert (category, type, message, title,
 * description, source, severity) against top-centrality graph nodes
 * (id, label, type) to classify:
 *
 *  CENTRAL    — alert keywords match at least one high-influence node
 *  PERIPHERAL — no centrality overlap found
 *
 * Stat tiles: alerts / nodes / central / peripheral
 * Amber badge on central count.
 * Filter tabs: ALL / CENTRAL / PERIPHERAL + text search.
 * Expand alert row → matched nodes with centrality score + relevance bar (max 6).
 * ▶ ASSESS: 2-sentence brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ AGCM  at left:4200 bottom:18, zIndex:68.
 * Event:   jarvis:agcm-toggle
 * Voice:   "alert graph / graph alert / agcm / central alerts / alert centrality /
 *           which alerts affect central nodes / graph alert monitor / alert node exposure"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const PURP  = "#A78BFA";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 4200;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseAlerts(raw) {
  return normaliseArray(raw).map((a, i) => ({
    id:       String(a.id ?? a.alert_id ?? i),
    title:    a.title ?? a.name ?? a.alert_name ?? `Alert ${i + 1}`,
    category: a.category ?? a.alert_category ?? "",
    type:     a.type ?? a.alert_type ?? "",
    message:  a.message ?? a.description ?? a.body ?? "",
    source:   a.source ?? a.origin ?? "",
    severity: (a.severity ?? a.level ?? a.priority ?? "INFO").toUpperCase(),
  }));
}

function normaliseNodes(raw) {
  const list = normaliseArray(raw);
  return list.map((n, i) => ({
    id:          String(n.id ?? n.node_id ?? i),
    label:       n.label ?? n.name ?? n.id ?? `Node ${i + 1}`,
    type:        n.type ?? n.node_type ?? "entity",
    centrality:  Number(n.centrality ?? n.score ?? n.degree ?? n.pagerank ?? 0),
  }));
}

function tokenise(text) {
  return String(text ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3);
}

function correlate(alert, nodes) {
  const alertTokens = new Set([
    ...tokenise(alert.title),
    ...tokenise(alert.category),
    ...tokenise(alert.type),
    ...tokenise(alert.message),
    ...tokenise(alert.source),
  ]);
  const matches = [];
  for (const n of nodes) {
    const nTokens = tokenise(`${n.id} ${n.label} ${n.type}`);
    const hits = nTokens.filter(t => alertTokens.has(t)).length;
    if (hits > 0) matches.push({ ...n, score: hits });
  }
  matches.sort((a, b) => b.score - a.score || b.centrality - a.centrality);
  return matches;
}

// ─── fetch ────────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [aRes, cRes] = await Promise.all([
    fetch(`${base}/v1/alerts`,             { headers: hdr }),
    fetch(`${base}/v1/graph/centrality`,   { headers: hdr }),
  ]);
  const alerts = normaliseAlerts(await aRes.json());
  const nodes  = normaliseNodes(await cRes.json());
  const enriched = alerts.map(a => {
    const matches = correlate(a, nodes);
    return { ...a, matches, classification: matches.length > 0 ? "CENTRAL" : "PERIPHERAL" };
  });
  return { alerts: enriched, nodes };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isAgcmQuery(q) {
  return /alert.?graph|graph.?alert|agcm|central.?alert|alert.?centralit|which.?alert.*central|graph.?alert.?monitor|alert.?node.?exposure/i.test(q);
}

export async function buildAgcmScript() {
  try {
    const { alerts, nodes } = await fetchAll();
    const central  = alerts.filter(a => a.classification === "CENTRAL");
    const topAlert = central[0];
    const prompt = `JARVIS alert-graph centrality monitor: ${alerts.length} active alerts cross-referenced against ${nodes.length} top-centrality graph nodes. ${central.length} alerts classified CENTRAL — their keywords overlap with high-influence network nodes.${topAlert ? ` Top-correlated alert: "${topAlert.title}" (severity: ${topAlert.severity}) matched ${topAlert.matches.length} central node(s) including "${topAlert.matches[0]?.label}".` : ""} Summarise the graph exposure state in exactly 2 sentences and recommend the highest-priority investigation action.`;
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ??
      `${central.length}/${alerts.length} alerts touch central graph nodes across ${nodes.length} tracked entities.`;
  } catch {
    return "Alert-graph centrality data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : accent === AMBER ? "245,166,35" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`, borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${AMBER}`,
          animation: "agcm-pulse 1.4s ease-in-out infinite",
          pointerEvents: "none",
        }} />
      )}
      <div style={{ fontSize: 16, fontWeight: 700, color: accent ?? CY, fontFamily: MONO }}>
        {value ?? "—"}
      </div>
      <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, textTransform: "uppercase", marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({ alert }) {
  const [expanded, setExpanded] = useState(false);
  const maxScore = Math.max(1, ...alert.matches.map(m => m.score));
  const maxCent  = Math.max(1, ...alert.matches.map(m => m.centrality));

  return (
    <div style={{
      borderRadius: 3, marginBottom: 3,
      border: `1px solid ${alert.classification === "CENTRAL" ? AMBER : MUTED}22`,
      background: alert.classification === "CENTRAL"
        ? "rgba(245,166,35,0.03)"
        : "rgba(41,231,255,0.02)",
    }}>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", cursor: "pointer" }}
      >
        <span style={{
          fontSize: 7, fontWeight: 700, letterSpacing: 1,
          color: alert.classification === "CENTRAL" ? AMBER : GREEN,
          border: `1px solid ${alert.classification === "CENTRAL" ? AMBER : GREEN}66`,
          padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap",
          width: 52, textAlign: "center",
        }}>
          {alert.classification === "CENTRAL" ? "CENTRAL" : "PERIPH"}
        </span>

        <span style={{
          fontSize: 7, fontWeight: 700,
          color: SEV_COLORS[alert.severity] ?? MUTED,
          border: `1px solid ${SEV_COLORS[alert.severity] ?? MUTED}66`,
          padding: "1px 4px", borderRadius: 2,
          width: 30, textAlign: "center", flexShrink: 0,
        }}>
          {alert.severity.slice(0, 4)}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 9, color: CY, fontWeight: 600,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {alert.title}
          </div>
          {(alert.category || alert.source) && (
            <div style={{ fontSize: 7, color: MUTED, marginTop: 1 }}>
              {[alert.category, alert.source].filter(Boolean).join(" · ").slice(0, 40)}
            </div>
          )}
        </div>

        {alert.matches.length > 0 && (
          <span style={{ fontSize: 8, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
            {alert.matches.length} node{alert.matches.length !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 8, color: MUTED }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 8px 8px 8px" }}>
          {alert.message && (
            <div style={{ fontSize: 7, color: MUTED, marginBottom: 6, fontStyle: "italic" }}>
              {alert.message.slice(0, 100)}
            </div>
          )}
          {alert.matches.length === 0 ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "4px 0" }}>
              No correlated central nodes found.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
              <div style={{ fontSize: 7, color: MUTED, letterSpacing: 1, marginBottom: 2 }}>
                MATCHED CENTRAL NODES
              </div>
              {alert.matches.slice(0, 6).map(m => {
                const relBar  = Math.round((m.score / maxScore) * 100);
                const centBar = Math.round((m.centrality / maxCent) * 100);
                return (
                  <div key={m.id} style={{
                    background: "rgba(41,231,255,0.03)",
                    border: `1px solid ${PURP}22`,
                    borderRadius: 3, padding: "4px 8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 7, fontWeight: 700, color: PURP,
                        border: `1px solid ${PURP}66`,
                        padding: "1px 4px", borderRadius: 2,
                        maxWidth: 56, textAlign: "center", flexShrink: 0,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {m.type.slice(0, 8)}
                      </span>
                      <span style={{
                        fontSize: 8, color: CY, flex: 1, minWidth: 0,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {m.label}
                      </span>
                      <span style={{ fontSize: 7, color: AMBER, fontWeight: 700, flexShrink: 0 }}>
                        {m.score}pt
                      </span>
                    </div>
                    <div style={{ fontSize: 7, color: MUTED, marginBottom: 2 }}>
                      centrality: {m.centrality.toFixed ? m.centrality.toFixed(3) : m.centrality}
                    </div>
                    <div style={{ height: 3, background: `${PURP}11`, borderRadius: 2, marginBottom: 2 }}>
                      <div style={{
                        width: `${relBar}%`, height: "100%",
                        background: PURP, borderRadius: 2,
                      }} />
                    </div>
                    <div style={{ height: 3, background: `${CY}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${centBar}%`, height: "100%",
                        background: CY, borderRadius: 2,
                      }} />
                    </div>
                  </div>
                );
              })}
              {alert.matches.length > 6 && (
                <div style={{ fontSize: 7, color: MUTED, textAlign: "center" }}>
                  +{alert.matches.length - 6} more node{alert.matches.length - 6 !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const TABS = ["ALL", "CENTRAL", "PERIPHERAL"];

export default function AlertGraphCentralityMonitor() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchAll());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const h = () => setOpen(v => !v);
    window.addEventListener("jarvis:agcm-toggle", h);
    return () => window.removeEventListener("jarvis:agcm-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildAgcmScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const alerts  = data?.alerts ?? [];
  const nodes   = data?.nodes  ?? [];
  const central = alerts.filter(a => a.classification === "CENTRAL");

  const visible = alerts
    .filter(a => tab === "ALL" || a.classification === tab)
    .filter(a => {
      if (!search) return true;
      const q = search.toLowerCase();
      return a.title.toLowerCase().includes(q)
        || a.category.toLowerCase().includes(q)
        || a.source.toLowerCase().includes(q);
    });

  if (!open) {
    return (
      <>
        <style>{`@keyframes agcm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Alert × Graph Centrality Monitor (AGCM)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◈ AGCM
          {central.length > 0 && (
            <span style={{
              marginLeft: 5, background: AMBER, color: "#000",
              borderRadius: 8, padding: "0 4px", fontSize: 8, fontWeight: 700,
              animation: "agcm-pulse 1.4s ease-in-out infinite",
            }}>
              {central.length}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes agcm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      <button
        onClick={() => setOpen(false)}
        title="Close AGCM"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◈ AGCM ▲
      </button>

      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 460, maxHeight: "74vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO,
        display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◈ ALERT × GRAPH CENTRALITY
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: assessing ? "rgba(41,231,255,0.1)" : "rgba(41,231,255,0.15)",
              border: `1px solid ${CY}66`, color: CY,
              fontFamily: MONO, fontSize: 8, padding: "3px 8px",
              borderRadius: 3, cursor: assessing ? "wait" : "pointer",
            }}
          >
            {assessing ? "…" : "▶ ASSESS"}
          </button>
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="ALERTS"     value={alerts.length}                 accent={CY} />
          <StatTile label="NODES"      value={nodes.length}                  accent={PURP} />
          <StatTile label="CENTRAL"    value={central.length}                accent={AMBER}
            pulse={central.length > 0} />
          <StatTile label="PERIPHERAL" value={alerts.length - central.length} accent={GREEN} />
        </div>

        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>{error}</div>
        )}

        {/* filter tabs + search */}
        <div style={{ display: "flex", gap: 4, padding: "0 12px 8px", alignItems: "center" }}>
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background: tab === t ? CY : "transparent",
                border: `1px solid ${tab === t ? CY : MUTED}44`,
                color: tab === t ? "#000" : MUTED,
                fontFamily: MONO, fontSize: 7, fontWeight: 700,
                padding: "2px 6px", borderRadius: 2, cursor: "pointer", letterSpacing: 1,
              }}
            >
              {t}
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="search alerts…"
            style={{
              flex: 1, background: "rgba(41,231,255,0.05)",
              border: `1px solid ${CY}33`, borderRadius: 2,
              color: CY, fontFamily: MONO, fontSize: 8,
              padding: "2px 6px", outline: "none",
            }}
          />
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0 12px 12px" }}>
          {visible.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: MUTED, padding: "12px 0", textAlign: "center" }}>
              {alerts.length === 0 ? "No alerts loaded." : "No alerts match filter."}
            </div>
          ) : (
            visible.map(a => <AlertRow key={a.id} alert={a} />)
          )}
        </div>
      </div>
    </>
  );
}
