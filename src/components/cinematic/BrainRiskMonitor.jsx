/**
 * F56 — Brain × Risk Signal Monitor (BRSM)
 *
 * Parallel-polls /v1/cinematic/brain (nodes/synapses growth metrics) and
 * /entities/RiskSignal (active threat landscape) every 60 s.
 *
 * Computes the BRAIN:RISK RATIO — nodes per active risk signal — to answer:
 * "Is Jarvis's intelligence outpacing the threat landscape?"
 *
 * AHEAD   — brain nodes-per-risk > 10  (coverage sufficient)
 * MATCHED — brain nodes-per-risk 4–10  (balanced)
 * BEHIND  — brain nodes-per-risk < 4   (risk accumulating faster)
 *
 * Stat tiles:  brain nodes / synapses / risk signals / B:R ratio
 * Risk breakdown: CRITICAL/HIGH/MEDIUM/LOW/INFO severity counts with bars.
 * Red pulse badge on CRITICAL count.
 * ▶ ASSESS: 2-sentence brain-vs-risk intelligence brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◉ BRSM  at left:1200 bottom:18, zIndex:68.
 * Event:   jarvis:brsm-toggle
 * Voice:   "brain risk / risk brain / brsm / brain vs risk /
 *           intelligence ratio / brain risk monitor / jarvis risk ratio"
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

const BTN_LEFT   = 1200;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const SEV_ORDER  = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
const SEV_COLORS = { CRITICAL: RED, HIGH: AMBER, MEDIUM: "#F59E0B", LOW: CY, INFO: MUTED };

// ─── helpers ─────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normaliseRiskSignals(raw) {
  return normaliseArray(raw).map((r, i) => ({
    id:       String(r.id ?? r.signal_id ?? i),
    name:     r.name ?? r.title ?? r.signal_name ?? `Signal ${i + 1}`,
    severity: (r.severity ?? r.level ?? r.priority ?? "INFO").toUpperCase(),
    source:   r.source ?? r.origin ?? "",
    status:   r.status ?? "",
  }));
}

function normaliseBrain(raw) {
  if (!raw || typeof raw !== "object") return { nodes: 0, synapses: 0 };
  return {
    nodes:    raw.nodes    ?? raw.node_count    ?? raw.total_nodes    ?? 0,
    synapses: raw.synapses ?? raw.synapse_count ?? raw.total_synapses ?? 0,
  };
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [bRes, rRes] = await Promise.all([
    fetch(`${base}/v1/cinematic/brain`,    { headers: hdr }),
    fetch(`${base}/entities/RiskSignal`,   { headers: hdr }),
  ]);
  const brain   = normaliseBrain(await bRes.json());
  const signals = normaliseRiskSignals(await rRes.json());
  return { brain, signals };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isBrsmQuery(q) {
  return /brain.?risk|risk.?brain|brsm|brain.?vs.?risk|intelligence.?ratio|brain.?risk.?monitor|jarvis.?risk.?ratio/i.test(q);
}

export async function buildBrsmScript() {
  try {
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const [bRes, rRes] = await Promise.all([
      fetch(`${base}/v1/cinematic/brain`,  { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`, { headers: hdr }),
    ]);
    const brain   = normaliseBrain(await bRes.json());
    const signals = normaliseRiskSignals(await rRes.json());
    const critical = signals.filter(s => s.severity === "CRITICAL").length;
    const ratio    = signals.length > 0
      ? (brain.nodes / signals.length).toFixed(1)
      : "∞";
    const status   = signals.length === 0
      ? "AHEAD"
      : brain.nodes / signals.length >= 10
        ? "AHEAD"
        : brain.nodes / signals.length >= 4
          ? "MATCHED"
          : "BEHIND";

    const prompt = `JARVIS brain-risk intelligence report: brain has ${brain.nodes} nodes and ${brain.synapses} synapses. Active risk signals: ${signals.length} total, ${critical} critical. Brain-to-risk ratio: ${ratio} nodes per signal (status: ${status}). Summarise the intelligence-versus-threat balance in exactly 2 sentences and recommend priority action.`;

    const aiRes = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method:  "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body:    JSON.stringify({ message: prompt }),
    });
    const aiData = await aiRes.json();
    return aiData.response ?? aiData.reply ?? aiData.message ?? `Brain ${brain.nodes} nodes vs ${signals.length} risk signals — ratio ${ratio}.`;
  } catch {
    return "Brain-risk monitor data unavailable.";
  }
}

// ─── Stat Tile ────────────────────────────────────────────────────────────────

function StatTile({ label, value, accent, pulse }) {
  return (
    <div style={{
      flex: 1, textAlign: "center", padding: "8px 4px",
      background: `rgba(${accent === RED ? "255,59,107" : "41,231,255"},0.04)`,
      border: `1px solid ${accent ?? CY}22`,
      borderRadius: 4, position: "relative",
    }}>
      {pulse && (
        <div style={{
          position: "absolute", inset: -1, borderRadius: 4,
          border: `1px solid ${RED}`,
          animation: "brsm-pulse 1.4s ease-in-out infinite",
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BrainRiskMonitor() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const result = await fetchAll();
      setData(result);
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
    window.addEventListener("jarvis:brsm-toggle", h);
    return () => window.removeEventListener("jarvis:brsm-toggle", h);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildBrsmScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const brain   = data?.brain   ?? { nodes: 0, synapses: 0 };
  const signals = data?.signals ?? [];
  const critical = signals.filter(s => s.severity === "CRITICAL").length;
  const ratio    = signals.length > 0
    ? (brain.nodes / signals.length).toFixed(1)
    : "∞";
  const brsmStatus = signals.length === 0
    ? "AHEAD"
    : brain.nodes / signals.length >= 10
      ? "AHEAD"
      : brain.nodes / signals.length >= 4
        ? "MATCHED"
        : "BEHIND";
  const statusColor = brsmStatus === "AHEAD" ? GREEN : brsmStatus === "MATCHED" ? AMBER : RED;

  // severity breakdown
  const sevCounts = {};
  for (const sev of SEV_ORDER) sevCounts[sev] = signals.filter(s => s.severity === sev).length;
  const maxSev = Math.max(1, ...Object.values(sevCounts));

  if (!open) {
    return (
      <>
        <style>{`@keyframes brsm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        <button
          onClick={() => setOpen(true)}
          title="Brain × Risk Signal Monitor (BRSM)"
          style={{
            position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
            background: "rgba(4,7,14,0.82)", border: `1px solid ${CY}55`,
            color: CY, fontFamily: MONO, fontSize: 9, fontWeight: 700,
            padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
          }}
        >
          ◉ BRSM
          {critical > 0 && (
            <span style={{
              marginLeft: 5, background: RED, color: "#fff",
              borderRadius: 8, padding: "0 4px", fontSize: 8,
              animation: "brsm-pulse 1.4s ease-in-out infinite",
            }}>
              {critical}
            </span>
          )}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{`@keyframes brsm-pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* toggle button */}
      <button
        onClick={() => setOpen(false)}
        title="Close BRSM"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 69,
          background: CY, border: "none",
          color: "#000", fontFamily: MONO, fontSize: 9, fontWeight: 700,
          padding: "4px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: 1,
        }}
      >
        ◉ BRSM ▲
      </button>

      {/* panel */}
      <div style={{
        position: "fixed", left: 10, bottom: 55, zIndex: 68,
        width: 440, maxHeight: "72vh",
        background: BG, border: `1px solid ${CY}44`,
        borderRadius: 6, fontFamily: MONO, display: "flex", flexDirection: "column",
        boxShadow: `0 0 30px ${CY}22`,
      }}>
        {/* header */}
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${CY}33`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 700, color: CY, letterSpacing: 2 }}>
              ◉ BRAIN × RISK MONITOR
            </span>
            {loading && (
              <span style={{ fontSize: 7, color: MUTED, marginLeft: 8 }}>polling…</span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1,
              color: statusColor, border: `1px solid ${statusColor}66`,
              padding: "1px 6px", borderRadius: 2,
            }}>
              {brsmStatus}
            </span>
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
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
          <StatTile label="NODES"    value={brain.nodes.toLocaleString()}    accent={CY} />
          <StatTile label="SYNAPSES" value={brain.synapses.toLocaleString()} accent={PURP} />
          <StatTile label="SIGNALS"  value={signals.length}                  accent={AMBER} />
          <StatTile label="B:R RATIO" value={ratio}                          accent={statusColor}
            pulse={brsmStatus === "BEHIND"} />
        </div>

        {/* error */}
        {error && (
          <div style={{ padding: "4px 12px", fontSize: 8, color: RED }}>
            {error}
          </div>
        )}

        {/* brain vs risk visual */}
        <div style={{ padding: "0 12px 8px" }}>
          <div style={{
            background: "rgba(41,231,255,0.04)", border: `1px solid ${CY}22`,
            borderRadius: 4, padding: "8px 10px",
          }}>
            <div style={{ fontSize: 8, color: MUTED, marginBottom: 6, letterSpacing: 1 }}>
              BRAIN INTELLIGENCE vs THREAT LANDSCAPE
            </div>
            {/* brain bar */}
            <div style={{ marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 8, color: CY }}>⬡ BRAIN NODES</span>
                <span style={{ fontSize: 8, color: CY }}>{brain.nodes.toLocaleString()}</span>
              </div>
              <div style={{ height: 5, background: "rgba(41,231,255,0.1)", borderRadius: 2 }}>
                <div style={{
                  width: brain.nodes > 0 ? "100%" : "0%",
                  height: "100%", background: CY, borderRadius: 2,
                  opacity: 0.8,
                }} />
              </div>
            </div>
            {/* risk bar — proportional to brain */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 8, color: AMBER }}>⚠ RISK SIGNALS</span>
                <span style={{ fontSize: 8, color: AMBER }}>{signals.length}</span>
              </div>
              <div style={{ height: 5, background: "rgba(245,166,35,0.1)", borderRadius: 2 }}>
                <div style={{
                  width: brain.nodes > 0
                    ? `${Math.min(100, (signals.length / brain.nodes) * 100)}%`
                    : signals.length > 0 ? "100%" : "0%",
                  height: "100%", background: AMBER, borderRadius: 2,
                  opacity: 0.8,
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* severity breakdown */}
        <div style={{
          padding: "0 12px 10px", flex: 1, overflowY: "auto",
        }}>
          <div style={{ fontSize: 8, color: MUTED, letterSpacing: 1, marginBottom: 6 }}>
            ACTIVE RISK SIGNALS BY SEVERITY
          </div>
          {signals.length === 0 && !loading ? (
            <div style={{ fontSize: 8, color: GREEN, padding: "8px 0" }}>
              No active risk signals — threat landscape clear.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {SEV_ORDER.map(sev => {
                const count = sevCounts[sev];
                if (count === 0) return null;
                const barPct = Math.round((count / maxSev) * 100);
                return (
                  <div key={sev} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px",
                    background: `rgba(${sev === "CRITICAL" ? "255,59,107" : sev === "HIGH" ? "245,166,35" : "41,231,255"},0.04)`,
                    border: `1px solid ${SEV_COLORS[sev]}22`, borderRadius: 3,
                  }}>
                    <span style={{
                      fontSize: 8, fontWeight: 700, letterSpacing: 1,
                      color: SEV_COLORS[sev],
                      border: `1px solid ${SEV_COLORS[sev]}66`,
                      padding: "1px 5px", borderRadius: 2, whiteSpace: "nowrap", width: 60,
                      textAlign: "center",
                    }}>
                      {sev}
                    </span>
                    <div style={{ flex: 1, height: 4, background: `${SEV_COLORS[sev]}11`, borderRadius: 2 }}>
                      <div style={{
                        width: `${barPct}%`, height: "100%",
                        background: SEV_COLORS[sev], borderRadius: 2,
                      }} />
                    </div>
                    <span style={{ fontSize: 9, color: SEV_COLORS[sev], fontWeight: 700, width: 20, textAlign: "right" }}>
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* recent signals list */}
          {signals.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 8, color: MUTED, letterSpacing: 1, marginBottom: 5 }}>
                LATEST SIGNALS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {signals.slice(0, 8).map(sig => (
                  <div key={sig.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "4px 8px",
                    background: "rgba(41,231,255,0.02)", borderRadius: 3,
                    border: `1px solid ${SEV_COLORS[sig.severity] ?? MUTED}22`,
                  }}>
                    <span style={{
                      fontSize: 7, fontWeight: 700,
                      color: SEV_COLORS[sig.severity] ?? MUTED,
                      width: 50, flexShrink: 0, letterSpacing: 0.5,
                    }}>
                      {sig.severity.slice(0, 4)}
                    </span>
                    <span style={{ fontSize: 8, color: CY, flex: 1, minWidth: 0,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }}>
                      {sig.name}
                    </span>
                    {sig.source && (
                      <span style={{ fontSize: 7, color: MUTED, flexShrink: 0 }}>
                        {sig.source.slice(0, 12)}
                      </span>
                    )}
                  </div>
                ))}
                {signals.length > 8 && (
                  <div style={{ fontSize: 7, color: MUTED, textAlign: "center", padding: "3px 0" }}>
                    +{signals.length - 8} more signals
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
