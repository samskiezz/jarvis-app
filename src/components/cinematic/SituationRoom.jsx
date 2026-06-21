/**
 * SituationRoom — F42
 * Unified ops situation-awareness grid: parallel-fetches
 *   /v1/jarvis/system/status · /v1/cinematic/brain
 *   /entities/RiskSignal     · /entities/SwarmJob
 *   /v1/ops/events
 * and renders a live ops-centre dashboard.
 * "JARVIS, situation room" | "sitrep" | "ops centre" opens the panel + speaks.
 * Additive only — mounted via App.jsx; intent exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const RED   = "#FF4D6D";
const YLW   = "#FFD700";
const GRN   = "#00E5A0";
const PURP  = "#b18cff";
const POLL  = 30_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const SITUATION_RE =
  /\b(situation.room|sitrep|ops.cent(?:er|re)|ops.overview|command.overview|sit.rep|mission.status|overall.status|full.status)\b/i;

export function isSituationQuery(t) {
  return SITUATION_RE.test(t || "");
}

/* ── data fetchers ─────────────────────────────────────────────────────────── */
async function fetchSystemStatus() {
  const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return r.json();
}

async function fetchBrain() {
  const r = await fetch(`${apiBase()}/v1/cinematic/brain`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  return r.json();
}

async function fetchRisks() {
  const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchSwarm() {
  const r = await fetch(`${apiBase()}/entities/SwarmJob`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d) ? d
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.jobs)    ? d.jobs
    : Array.isArray(d?.results) ? d.results
    : [];
}

async function fetchOpsEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const all = Array.isArray(d) ? d : (d?.items || d?.events || d?.results || []);
  return all.slice(0, 6);
}

/* ── TTS brief builder ─────────────────────────────────────────────────────── */
export async function buildSituationScript() {
  try {
    const [sys, brain, risks, swarm, ops] = await Promise.allSettled([
      fetchSystemStatus(), fetchBrain(), fetchRisks(), fetchSwarm(), fetchOpsEvents(),
    ]);

    const sysD   = sys.status   === "fulfilled" ? sys.value   : null;
    const brainD = brain.status === "fulfilled" ? brain.value : null;
    const risksD = risks.status === "fulfilled" ? risks.value : [];
    const swarmD = swarm.status === "fulfilled" ? swarm.value : [];
    const opsD   = ops.status   === "fulfilled" ? ops.value   : [];

    const cpuPct  = sysD?.cpu_percent   ?? sysD?.cpu    ?? null;
    const memPct  = sysD?.mem_percent   ?? sysD?.memory ?? null;
    const critical = risksD.filter(r => /critical/i.test(r.severity || r.level || "")).length;
    const running  = swarmD.filter(j => /running|active/i.test(j.status || "")).length;
    const opsCount = opsD.length;
    const nodes    = brainD?.total_nodes ?? brainD?.nodes ?? null;

    const parts = [];
    if (cpuPct != null) parts.push(`CPU at ${Math.round(cpuPct)} percent`);
    if (memPct != null) parts.push(`memory at ${Math.round(memPct)} percent`);
    if (nodes  != null) parts.push(`brain graph has ${nodes} nodes`);
    if (critical > 0)   parts.push(`${critical} critical risk signal${critical > 1 ? "s" : ""} active`);
    else                parts.push("no critical risks");
    if (running  > 0)   parts.push(`${running} swarm job${running > 1 ? "s" : ""} in progress`);
    if (opsCount > 0)   parts.push(`${opsCount} recent ops events`);

    return (
      `Situation room online, sir. ${parts.join("; ")}. ` +
      `All feeds live. Standing by.`
    );
  } catch (_) {
    return "Situation room is online. All systems standing by, sir.";
  }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */
function riskSev(r) { return r.severity || r.level || r.threat_level || "medium"; }
function sevColor(s) {
  const v = (s || "").toLowerCase();
  if (/critical/.test(v)) return RED;
  if (/high/.test(v))     return "#FF8C00";
  if (/medium/.test(v))   return YLW;
  return GRN;
}
function opsSev(ev) { return ev.severity ?? ev.payload?.severity ?? ev.level ?? 0; }
function opsColor(sev) {
  if (sev >= 90) return RED;
  if (sev >= 70) return "#FF8C00";
  if (sev >= 40) return YLW;
  return CY;
}
function opsName(ev) { return ev.name || ev.message || ev.title || ev.type || `Event #${ev.id}`; }
function formatAge(ts) {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

/* ── component ─────────────────────────────────────────────────────────────── */
export default function SituationRoom() {
  const [open, setOpen]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData]     = useState(null);
  const [updated, setUpdated] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [sys, brain, risks, swarm, ops] = await Promise.allSettled([
      fetchSystemStatus(), fetchBrain(), fetchRisks(), fetchSwarm(), fetchOpsEvents(),
    ]);
    setData({
      sys:   sys.status   === "fulfilled" ? sys.value   : null,
      brain: brain.status === "fulfilled" ? brain.value : null,
      risks: risks.status === "fulfilled" ? risks.value : [],
      swarm: swarm.status === "fulfilled" ? swarm.value : [],
      ops:   ops.status   === "fulfilled" ? ops.value   : [],
    });
    setUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && !data) refresh();
  }, [open, data, refresh]);

  useEffect(() => {
    if (!open) { clearInterval(timerRef.current); return; }
    timerRef.current = setInterval(refresh, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, refresh]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:situation-toggle", onToggle);
    return () => window.removeEventListener("jarvis:situation-toggle", onToggle);
  }, []);

  /* derived */
  const sysD    = data?.sys;
  const brainD  = data?.brain;
  const risks   = data?.risks  ?? [];
  const swarm   = data?.swarm  ?? [];
  const opsEvts = data?.ops    ?? [];

  const cpuPct = sysD?.cpu_percent ?? sysD?.cpu    ?? null;
  const memPct = sysD?.mem_percent ?? sysD?.memory ?? null;
  const load1  = sysD?.load_avg?.["1m"]  ?? sysD?.load_1  ?? sysD?.load1  ?? null;
  const nodes  = brainD?.total_nodes ?? brainD?.nodes ?? null;
  const syn    = brainD?.total_synapses ?? brainD?.synapses ?? null;

  const critRisks = risks.filter(r => /critical/i.test(riskSev(r))).length;
  const highRisks = risks.filter(r => /high/i.test(riskSev(r))).length;
  const medRisks  = risks.filter(r => /medium/i.test(riskSev(r))).length;
  const lowRisks  = risks.filter(r => /low/i.test(riskSev(r))).length;

  const runningJobs = swarm.filter(j => /running|active/i.test(j.status || "")).length;
  const queuedJobs  = swarm.filter(j => /queue|pending/i.test(j.status || "")).length;
  const failedJobs  = swarm.filter(j => /fail|error/i.test(j.status || "")).length;

  const hasCritical = critRisks > 0 || failedJobs > 0;

  const pct = (v) => (v != null ? `${Math.round(v)}%` : "—");
  const num = (v) => (v != null ? v.toLocaleString() : "—");

  /* ── render ── */
  return (
    <>
      {/* Bottom-strip toggle */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Situation Room — F42 (all live feeds)"
        style={{
          position: "fixed", bottom: 18, left: 3092, zIndex: 60,
          background: open ? `${CY}22` : "rgba(5,8,13,0.7)",
          border: `1px solid ${open ? CY : CY + "55"}`,
          color: open ? CY : `${CY}99`,
          borderRadius: 6, padding: "3px 9px", fontSize: 9, letterSpacing: 1.5,
          fontFamily: "'JetBrains Mono',monospace", cursor: "pointer",
          backdropFilter: "blur(6px)", whiteSpace: "nowrap",
        }}
      >
        ⊕ SITREP{hasCritical && (
          <span style={{
            marginLeft: 4, background: RED, color: "#fff",
            borderRadius: 3, padding: "0px 4px", fontSize: 8,
            animation: "sitrepPulse 1.2s infinite",
          }}>!</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", bottom: 54, left: 3092,
          width: "min(560px, 96vw)",
          maxHeight: "80vh",
          overflowY: "auto",
          background: "rgba(6,11,18,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 12,
          boxShadow: `0 0 70px ${CY}18`,
          fontFamily: "'JetBrains Mono',monospace",
          zIndex: 62,
        }}>

          {/* ── Header ── */}
          <div style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: CY, fontSize: 11, fontWeight: "bold", letterSpacing: 2 }}>
              ⊕ SITUATION ROOM
            </span>
            {loading && (
              <span style={{ fontSize: 9, color: `${CY}99`, marginLeft: 4 }}>refreshing…</span>
            )}
            <span style={{ marginLeft: "auto", fontSize: 9, color: "#6E8AA0" }}>
              {updated ? `updated ${updated.toLocaleTimeString()}` : ""}
            </span>
            <button onClick={refresh} disabled={loading} style={{
              background: "transparent", border: `1px solid ${CY}33`, color: CY,
              borderRadius: 4, padding: "2px 8px", fontSize: 9, cursor: "pointer",
              opacity: loading ? 0.5 : 1,
            }}>↺</button>
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: "#6E8AA0",
              fontSize: 12, cursor: "pointer", padding: "0 2px",
            }}>✕</button>
          </div>

          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* ── Row 1: System vitals + Brain ── */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                SYSTEM VITALS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                {[
                  { label: "CPU",     val: pct(cpuPct), color: cpuPct > 85 ? RED : cpuPct > 65 ? YLW : GRN },
                  { label: "MEMORY",  val: pct(memPct), color: memPct > 85 ? RED : memPct > 65 ? YLW : GRN },
                  { label: "LOAD",    val: load1 != null ? load1.toFixed(2) : "—", color: CY },
                  { label: "NODES",   val: num(nodes),  color: PURP },
                  { label: "SYNAPSE", val: num(syn),    color: PURP },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{
                    background: `${color}0d`,
                    border: `1px solid ${color}44`,
                    borderRadius: 7, padding: "8px 8px 6px",
                    textAlign: "center",
                  }}>
                    <div style={{ fontSize: 7, color: `${color}99`, letterSpacing: 1.5, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: "bold", color, lineHeight: 1 }}>
                      {loading && val === "—" ? "…" : val}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Row 2: Risk signals ── */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                RISK SIGNALS
                <span style={{ marginLeft: 8, color: `${CY}66` }}>({risks.length} total)</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
                {[
                  { label: "CRITICAL", count: critRisks, color: RED  },
                  { label: "HIGH",     count: highRisks, color: "#FF8C00" },
                  { label: "MEDIUM",   count: medRisks,  color: YLW  },
                  { label: "LOW",      count: lowRisks,  color: GRN  },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{
                    background: `${color}0d`,
                    border: `1px solid ${color}${count > 0 ? "88" : "33"}`,
                    borderRadius: 7, padding: "8px 8px 6px",
                    textAlign: "center",
                    animation: label === "CRITICAL" && count > 0 ? "sitrepPulse 1.4s infinite" : "none",
                  }}>
                    <div style={{ fontSize: 7, color: `${color}99`, letterSpacing: 1.5, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: "bold", color, lineHeight: 1 }}>
                      {loading && risks.length === 0 ? "…" : count}
                    </div>
                  </div>
                ))}
              </div>
              {/* top critical risk name */}
              {critRisks > 0 && (() => {
                const top = risks.find(r => /critical/i.test(riskSev(r)));
                return top ? (
                  <div style={{
                    marginTop: 6, padding: "5px 8px",
                    background: `${RED}11`, border: `1px solid ${RED}44`, borderRadius: 5,
                    fontSize: 9, color: RED, letterSpacing: 0.5,
                  }}>
                    ⚠ {top.name || top.title || top.description || `RiskSignal #${top.id}`}
                  </div>
                ) : null;
              })()}
            </section>

            {/* ── Row 3: Swarm jobs ── */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                SWARM JOBS
                <span style={{ marginLeft: 8, color: `${CY}66` }}>({swarm.length} total)</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                {[
                  { label: "RUNNING", count: runningJobs, color: GRN  },
                  { label: "QUEUED",  count: queuedJobs,  color: YLW  },
                  { label: "FAILED",  count: failedJobs,  color: RED  },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{
                    background: `${color}0d`,
                    border: `1px solid ${color}${count > 0 ? "88" : "33"}`,
                    borderRadius: 7, padding: "8px 8px 6px",
                    textAlign: "center",
                    animation: label === "FAILED" && count > 0 ? "sitrepPulse 1.4s infinite" : "none",
                  }}>
                    <div style={{ fontSize: 7, color: `${color}99`, letterSpacing: 1.5, marginBottom: 4 }}>
                      {label}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: "bold", color, lineHeight: 1 }}>
                      {loading && swarm.length === 0 ? "…" : count}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── Row 4: Recent ops events ── */}
            <section>
              <div style={{ fontSize: 9, color: `${CY}88`, letterSpacing: 2, marginBottom: 6 }}>
                RECENT OPS EVENTS
              </div>
              {opsEvts.length === 0 ? (
                <div style={{ fontSize: 9, color: `${CY}55`, padding: "6px 0" }}>
                  {loading ? "loading…" : "no recent events"}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {opsEvts.map((ev, i) => {
                    const sev = opsSev(ev);
                    const col = opsColor(sev);
                    return (
                      <div key={ev.id ?? i} style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "5px 8px",
                        background: `${col}0a`,
                        border: `1px solid ${col}33`,
                        borderRadius: 5,
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: col, flexShrink: 0, marginTop: 3,
                          boxShadow: sev >= 90 ? `0 0 6px ${col}` : "none",
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 9, color: col, lineHeight: 1.4 }}>
                            {opsName(ev)}
                          </div>
                          {ev.payload?.description || ev.description ? (
                            <div style={{ fontSize: 8, color: "#6E8AA0", lineHeight: 1.3, marginTop: 1 }}>
                              {(ev.payload?.description || ev.description || "").slice(0, 80)}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ fontSize: 8, color: "#6E8AA0", flexShrink: 0 }}>
                          {formatAge(ev.created_at || ev.timestamp || ev.time)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

          </div>

          {/* ── Footer ── */}
          <div style={{
            padding: "6px 14px 10px",
            borderTop: `1px solid ${CY}11`,
            fontSize: 8, color: "#6E8AA0",
            display: "flex", justifyContent: "space-between",
          }}>
            <span>auto-refresh every 30s</span>
            <span style={{ color: GRN }}>◉ ALL FEEDS LIVE</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sitrepPulse {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.45; }
        }
      `}</style>
    </>
  );
}
