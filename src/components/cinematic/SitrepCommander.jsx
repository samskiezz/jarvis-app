/**
 * F112 — SITREP Commander
 *
 * On-demand Situation Report: parallel-fetches five real endpoints
 *   /v1/jarvis/system/status · /v1/cinematic/brain · /entities/RiskSignal
 *   /entities/SwarmJob · /v1/investigations
 * then feeds the combined snapshot into /v1/jarvis/agent/chat to produce a
 * structured 5-bullet SITREP (System · Knowledge · Threats · Operations · Cases).
 * First bullet spoken via jarvis:speak-dossier; full report shown in panel.
 *
 * No auto-poll — on-demand only (no GPU waste between requests).
 *
 * Toggle: ◎ SITREP  bottom:8, left:31800, zIndex:69
 * Voice:  "sitrep / situation report / tactical brief / full brief /
 *          status report / what's the situation / give me a sitrep"
 * Event:  jarvis:sitrep-toggle
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 31800;
const ACCENT   = "#00E5FF";
const RED      = "#FF3030";
const AMBER    = "#FFB347";

const API_KEY = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ──────────────────────────────────────────────────

const SITREP_RE =
  /\b(sitrep|situation\s+report|tactical\s+brief|full\s+brief|give\s+me\s+(a\s+)?sitrep|what'?s?\s+the\s+situation|status\s+report|command\s+brief)\b/i;

export function isSitrepQuery(q) { return SITREP_RE.test(q); }

export async function buildSitrepScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };

    const [sysRes, brainRes, riskRes, swarmRes, invRes] = await Promise.all([
      fetch(`${base}/v1/jarvis/system/status`, { headers: hdr }),
      fetch(`${base}/v1/cinematic/brain`,       { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,       { headers: hdr }),
      fetch(`${base}/entities/SwarmJob`,         { headers: hdr }),
      fetch(`${base}/v1/investigations`,         { headers: hdr }),
    ]);

    const sys   = await sysRes.json().catch(() => ({}));
    const brain = await brainRes.json().catch(() => ({}));
    const risks = await riskRes.json().catch(() => ([]));
    const swarm = await swarmRes.json().catch(() => ([]));
    const inv   = await invRes.json().catch(() => ([]));

    const riskArr  = Array.isArray(risks) ? risks : (risks?.data ?? risks?.items ?? []);
    const swarmArr = Array.isArray(swarm) ? swarm : (swarm?.data ?? swarm?.items ?? []);
    const invArr   = Array.isArray(inv)   ? inv   : (inv?.data   ?? inv?.items   ?? []);

    const critRisks = riskArr.filter((r) =>
      ["CRITICAL", "HIGH"].includes((r.severity || r.level || "").toUpperCase()),
    ).length;
    const runningJobs = swarmArr.filter((j) =>
      ["RUNNING", "IN_PROGRESS", "ACTIVE"].includes((j.status || "").toUpperCase()),
    ).length;
    const openCases = invArr.filter((i) =>
      ["OPEN", "INVESTIGATING", "ACTIVE"].includes((i.status || "").toUpperCase()),
    ).length;

    const context =
      `JARVIS SITREP request — compile a 5-bullet situation report now:\n` +
      `SYSTEM: CPU=${sys.cpu_percent ?? sys.cpu ?? "?"}% MEM=${sys.mem_percent ?? sys.memory ?? "?"}% ` +
      `LOAD=${sys.load ?? sys.load_avg ?? "?"} UPTIME=${sys.uptime ?? "?"}\n` +
      `KNOWLEDGE GRAPH: nodes=${brain.nodes ?? brain.node_count ?? "?"} ` +
      `synapses=${brain.synapses ?? brain.synapse_count ?? brain.edges ?? "?"}\n` +
      `THREATS: ${riskArr.length} active risk signals, ${critRisks} CRITICAL/HIGH severity\n` +
      `OPERATIONS: ${swarmArr.length} swarm jobs total, ${runningJobs} currently running\n` +
      `INVESTIGATIONS: ${invArr.length} cases, ${openCases} open/active\n\n` +
      `Deliver exactly 5 numbered bullets, one per domain (System, Knowledge, Threats, Operations, Cases). ` +
      `Each bullet: 1 crisp sentence. Formal British butler tone. Start: "SITREP as of now, sir."`;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: context }),
    });
    const d = await r.json();
    return (d.answer || "SITREP unavailable, sir.").trim();
  } catch {
    return "SITREP unavailable — unable to reach operational systems, sir.";
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function fetchSnapshot() {
  const base = apiBase();
  const hdr  = { Authorization: `Bearer ${API_KEY}` };

  const [sysRes, brainRes, riskRes, swarmRes, invRes] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`, { headers: hdr }),
    fetch(`${base}/v1/cinematic/brain`,       { headers: hdr }),
    fetch(`${base}/entities/RiskSignal`,       { headers: hdr }),
    fetch(`${base}/entities/SwarmJob`,         { headers: hdr }),
    fetch(`${base}/v1/investigations`,         { headers: hdr }),
  ]);

  const parse = (r) =>
    r.status === "fulfilled" ? r.value.json().catch(() => null) : Promise.resolve(null);

  const [sys, brain, risks, swarm, inv] = await Promise.all([
    parse(sysRes), parse(brainRes), parse(riskRes), parse(swarmRes), parse(invRes),
  ]);

  const riskArr  = Array.isArray(risks) ? risks : (risks?.data ?? risks?.items ?? []);
  const swarmArr = Array.isArray(swarm) ? swarm : (swarm?.data ?? swarm?.items ?? []);
  const invArr   = Array.isArray(inv)   ? inv   : (inv?.data   ?? inv?.items   ?? []);

  return { sys: sys ?? {}, brain: brain ?? {}, riskArr, swarmArr, invArr };
}

function statusColor(v, warn, crit) {
  if (v === null || v === undefined) return S.textMuted;
  if (v >= crit) return RED;
  if (v >= warn) return AMBER;
  return "#4ADE80";
}

// ── component ────────────────────────────────────────────────────────────────

export default function SitrepCommander() {
  const [open,      setOpen]      = useState(false);
  const [snap,      setSnap]      = useState(null);
  const [sitrep,    setSitrep]    = useState("");
  const [loading,   setLoading]   = useState(false);
  const [running,   setRunning]   = useState(false);
  const abortRef = useRef(null);

  const loadSnap = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSnapshot();
      setSnap(s);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (open && !snap) loadSnap();
  }, [open, snap, loadSnap]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:sitrep-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sitrep-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isSitrepQuery(q)) { setOpen(true); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  async function runSitrep() {
    setRunning(true);
    setSitrep("");
    try {
      await loadSnap();
      const text = await buildSitrepScript();
      setSitrep(text);
      const firstBullet = text.split(/\n/)[0] ?? text;
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: firstBullet } }),
      );
    } catch {
      setSitrep("SITREP generation failed, sir.");
    }
    setRunning(false);
  }

  const s = snap;
  const cpu       = s?.sys?.cpu_percent  ?? s?.sys?.cpu   ?? null;
  const mem       = s?.sys?.mem_percent  ?? s?.sys?.memory ?? null;
  const nodes     = s?.brain?.nodes      ?? s?.brain?.node_count   ?? null;
  const synapses  = s?.brain?.synapses   ?? s?.brain?.synapse_count ?? s?.brain?.edges ?? null;
  const riskCount = s?.riskArr?.length   ?? 0;
  const critCount = s?.riskArr?.filter(
    (r) => ["CRITICAL", "HIGH"].includes((r.severity || r.level || "").toUpperCase()),
  ).length ?? 0;
  const jobCount  = s?.swarmArr?.length  ?? 0;
  const runCount  = s?.swarmArr?.filter(
    (j) => ["RUNNING", "IN_PROGRESS", "ACTIVE"].includes((j.status || "").toUpperCase()),
  ).length ?? 0;
  const caseCount = s?.invArr?.length    ?? 0;
  const openCount = s?.invArr?.filter(
    (i) => ["OPEN", "INVESTIGATING", "ACTIVE"].includes((i.status || "").toUpperCase()),
  ).length ?? 0;

  const tiles = [
    { label: "CPU",       val: cpu   !== null ? `${cpu}%`  : "—",   color: statusColor(cpu,  70, 90) },
    { label: "MEM",       val: mem   !== null ? `${mem}%`  : "—",   color: statusColor(mem,  75, 90) },
    { label: "NODES",     val: nodes     !== null ? nodes     : "—", color: C.neon   },
    { label: "SYNAPSES",  val: synapses  !== null ? synapses  : "—", color: C.blue   },
    { label: "RISKS",     val: riskCount,                             color: critCount > 0 ? RED : AMBER },
    { label: "CRIT/HIGH", val: critCount,                             color: critCount > 0 ? RED : S.textMuted },
    { label: "JOBS",      val: jobCount,                              color: C.neon   },
    { label: "RUNNING",   val: runCount,                              color: runCount > 0 ? "#4ADE80" : S.textMuted },
    { label: "CASES",     val: caseCount,                             color: C.blue   },
    { label: "OPEN",      val: openCount,                             color: openCount > 0 ? AMBER : S.textMuted },
  ];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="SITREP Commander — on-demand situation report (◎ SITREP)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? `${ACCENT}22` : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? ACCENT : S.border}`,
          borderRadius: S.radius, color: open ? ACCENT : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 10px ${ACCENT}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◎ SITREP
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${ACCENT}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "74vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: ACCENT, letterSpacing: 2, fontWeight: 700 }}>
              SITREP COMMANDER
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button
                onClick={loadSnap}
                disabled={loading}
                style={{
                  background: "transparent", border: `1px solid ${S.border}`,
                  color: S.textMuted, borderRadius: S.radius, padding: "2px 6px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                  opacity: loading ? 0.4 : 1,
                }}
                title="Refresh data snapshot"
              >
                {loading ? "◌" : "↻"}
              </button>
              <button
                onClick={runSitrep}
                disabled={running}
                style={{
                  background: running ? `${ACCENT}11` : `${ACCENT}22`,
                  border: `1px solid ${running ? ACCENT : C.blue}`,
                  color: running ? ACCENT : C.blue,
                  borderRadius: S.radius, padding: "2px 9px",
                  fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                  opacity: running ? 0.7 : 1,
                  fontWeight: 700,
                }}
              >
                {running ? "◌ GENERATING…" : "▶ RUN SITREP"}
              </button>
            </div>
          </div>

          {/* Stat grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5,1fr)",
            gap: 5, padding: "8px 12px",
          }}>
            {tiles.map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 3px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.sm, fontWeight: 700 }}>
                  {val ?? "—"}
                </div>
                <div style={{ color: S.textMuted, fontSize: "7px", letterSpacing: 0.5 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${S.border}`, margin: "0 12px" }} />

          {/* SITREP text area */}
          <div style={{
            overflowY: "auto", flex: 1, padding: "10px 14px 12px",
          }}>
            {!sitrep && !running && (
              <div style={{
                color: S.textMuted, fontSize: S.fs.xxs, lineHeight: 1.7, paddingTop: 4,
              }}>
                <div style={{ color: ACCENT, fontWeight: 700, marginBottom: 6 }}>
                  AWAITING SITREP REQUEST
                </div>
                <div>Sources:</div>
                {[
                  "/v1/jarvis/system/status — system health",
                  "/v1/cinematic/brain — knowledge graph state",
                  "/entities/RiskSignal — active threat signals",
                  "/entities/SwarmJob — running agent operations",
                  "/v1/investigations — open case files",
                ].map((line) => (
                  <div key={line} style={{ color: S.text, paddingLeft: 8, marginTop: 2 }}>
                    · {line}
                  </div>
                ))}
                <div style={{ marginTop: 10, color: S.textMuted }}>
                  Press ▶ RUN SITREP to generate a consolidated 5-bullet situation report.
                  First bullet is spoken aloud by JARVIS.
                </div>
              </div>
            )}

            {running && !sitrep && (
              <div style={{
                color: ACCENT, fontSize: S.fs.xxs, padding: "16px 0",
                textAlign: "center", letterSpacing: 1,
              }}>
                ◌ compiling situation report…
              </div>
            )}

            {sitrep && (
              <div>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "center", marginBottom: 8,
                }}>
                  <span style={{ color: ACCENT, fontSize: "9px", letterSpacing: 2, fontWeight: 700 }}>
                    SITUATION REPORT
                  </span>
                  <button
                    onClick={() => navigator.clipboard?.writeText(sitrep)}
                    title="Copy SITREP to clipboard"
                    style={{
                      background: "transparent", border: `1px solid ${S.border}`,
                      color: S.textMuted, borderRadius: S.radius,
                      padding: "1px 6px", fontFamily: S.mono, fontSize: "8px",
                      cursor: "pointer",
                    }}
                  >
                    ⎘ copy
                  </button>
                </div>
                {sitrep.split(/\n+/).filter(Boolean).map((line, i) => (
                  <div key={i} style={{
                    padding: "5px 0",
                    borderBottom: i < sitrep.split(/\n+/).filter(Boolean).length - 1
                      ? `1px solid ${S.border}22` : "none",
                    color: line.match(/^SITREP/i) ? ACCENT
                      : line.match(/^\d+\./) ? S.textHi
                      : S.text,
                    fontSize: S.fs.xxs,
                    lineHeight: 1.65,
                    fontWeight: line.match(/^SITREP/i) ? 700 : 400,
                  }}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
