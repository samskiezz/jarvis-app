/**
 * F242 — Full-Stack Intelligence Dashboard (FSID)
 *
 * Unified situational awareness panel. Parallel-fetches 5 real endpoints:
 *   /v1/jarvis/system/status   — service health, CPU/MEM/LOAD
 *   /entities/RiskSignal       — active risk signals
 *   /v1/investigations         — open investigation cases
 *   /v1/ops/events             — live ops events
 *   /functions/getLiveIntel    — live world events (quakes/crypto/FX)
 *
 * Computes a DEFCON 1–4 state from the combined picture:
 *   DEFCON 1 (CRITICAL) — critical service + critical risks + critical ops
 *   DEFCON 2 (ELEVATED) — any critical signal in any stream
 *   DEFCON 3 (GUARDED)  — warnings present
 *   DEFCON 4 (ALL CLEAR) — everything green
 *
 * Displays a compact 2×3 grid summary; expand any section.
 * ▶ BRIEF → /v1/jarvis/agent/chat 3-sentence cross-domain brief + TTS.
 *
 * Toggle:  ⬟ FSID  at left:4980, bottom:18, zIndex:68
 * Event:   jarvis:fsid-toggle
 * Voice:   "full dashboard / unified intel / fsid / situational awareness /
 *           ops center / status dashboard / intel overview"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useState } from "react";

const BTN_LEFT = 4980;
const POLL_MS  = 60_000;
const CY       = "#29E7FF";
const GRN      = "#22c55e";
const AMB      = "#f59e0b";
const RED      = "#ef4444";
const BLU      = "#60a5fa";
const PRP      = "#a78bfa";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const FSID_RE =
  /\b(fsid|full[\s-]?dash|unified\s+intel|situational\s+aware|ops\s+center|status\s+dash|intel\s+overview|full\s+intel|full\s+status|operational\s+picture|intelligence\s+dash|all\s+streams|cross[\s-]?domain\s+intel)\b/i;

export function isFsidQuery(q) { return FSID_RE.test(q || ""); }

export async function buildFsidScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [sysRes, rskRes, invRes, opsRes, liveRes] = await Promise.allSettled([
      fetch(`${base}/v1/jarvis/system/status`,  { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/entities/RiskSignal`,       { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/investigations`,         { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/v1/ops/events?limit=20`,    { headers: hdr }).then((r) => r.json()),
      fetch(`${base}/functions/getLiveIntel`,    { headers: hdr }).then((r) => r.json()),
    ]);
    const sys  = sysRes.status  === "fulfilled" ? sysRes.value  : {};
    const rsk  = rskRes.status  === "fulfilled" ? normaliseArray(rskRes.value)  : [];
    const inv  = invRes.status  === "fulfilled" ? normaliseArray(invRes.value)  : [];
    const ops  = opsRes.status  === "fulfilled" ? normaliseArray(opsRes.value)  : [];
    const live = liveRes.status === "fulfilled" ? liveRes.value : {};
    const critRisk = rsk.filter((r) => (r.severity || "").toLowerCase() === "critical").length;
    const critOps  = ops.filter((o) => (o.severity || o.level || "").toLowerCase() === "critical").length;
    const quakes   = Array.isArray(live?.earthquakes) ? live.earthquakes.length : 0;
    const crypto   = Array.isArray(live?.crypto)      ? live.crypto.length      : 0;
    return (
      `Full-Stack Intelligence Dashboard: system health ${sys.status || "unknown"}, ` +
      `${rsk.length} risk signals (${critRisk} critical), ` +
      `${inv.length} open investigations, ` +
      `${ops.length} ops events (${critOps} critical), ` +
      `${quakes} seismic events and ${crypto} crypto feeds active. ` +
      `Provide a 3-sentence cross-domain operational brief covering top risks, ` +
      `open cases, and world event exposure — formal British tone.`
    );
  } catch {
    return "Full-stack intelligence dashboard online — opening unified view now, sir.";
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function normaliseArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "results", "data", "records", "signals", "events",
                    "investigations", "cases", "jobs", "contacts"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function sevColor(sev) {
  const s = (sev || "").toLowerCase();
  if (s === "critical") return RED;
  if (s === "high")     return AMB;
  if (s === "medium")   return "#fb923c";
  if (s === "low")      return BLU;
  return "#64748b";
}

function defcon(critSvc, critRisk, critOps, highRisk) {
  if (critSvc > 0 && (critRisk > 0 || critOps > 0)) return 1;
  if (critRisk > 0 || critOps > 0)                   return 2;
  if (highRisk > 0)                                   return 3;
  return 4;
}

function defconLabel(d) {
  return ["", "CRITICAL", "ELEVATED", "GUARDED", "ALL CLEAR"][d] || "UNKNOWN";
}
function defconColor(d) {
  return [RED, RED, AMB, "#fbbf24", GRN][d] || GRN;
}

function sysCritical(status) {
  if (!status || typeof status !== "object") return 0;
  let count = 0;
  const metricKeys = ["cpu_percent", "memory_percent", "disk_percent",
                      "cpu_usage", "memory_usage", "disk_usage"];
  for (const k of metricKeys) {
    if (typeof status[k] === "number" && status[k] >= 90) count++;
  }
  const svcList = status.services || status.components || status.checks || [];
  if (Array.isArray(svcList)) {
    for (const svc of svcList) {
      const st = (svc.status || svc.state || svc.health || "").toLowerCase();
      if (st.includes("err") || st.includes("fail") || st.includes("down") || st.includes("critical")) {
        count++;
      }
    }
  }
  return count;
}

// ── styles ────────────────────────────────────────────────────────────────────

const TILE = {
  flex: "1 1 90px",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 8,
  padding: "10px 12px",
  textAlign: "center",
};
const PILL = {
  display: "inline-block",
  padding: "1px 7px",
  borderRadius: 9,
  fontSize: 10,
  fontWeight: 700,
  marginRight: 4,
};
const SEC = {
  padding: "10px 14px 8px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};
const SEC_HDR = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  marginBottom: 6,
};
const ITEM = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 0",
  fontSize: 11,
  color: "#e2e8f0",
};

// ── component ─────────────────────────────────────────────────────────────────

export default function FullStackIntelDashboard() {
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");
  const [sys,        setSys]        = useState({});
  const [risks,      setRisks]      = useState([]);
  const [invs,       setInvs]       = useState([]);
  const [ops,        setOps]        = useState([]);
  const [live,       setLive]       = useState({});
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const [lastFetch,  setLastFetch]  = useState(null);
  const [expanded,   setExpanded]   = useState(null); // "risk"|"inv"|"ops"|"world"

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [sysR, rskR, invR, opsR, liveR] = await Promise.allSettled([
        fetch(`${base}/v1/jarvis/system/status`,  { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`,       { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/investigations`,         { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/ops/events?limit=20`,    { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/functions/getLiveIntel`,    { headers: hdr }).then((r) => r.json()),
      ]);
      if (sysR.status  === "fulfilled") setSys(sysR.value   || {});
      if (rskR.status  === "fulfilled") setRisks(normaliseArray(rskR.value));
      if (invR.status  === "fulfilled") setInvs(normaliseArray(invR.value));
      if (opsR.status  === "fulfilled") setOps(normaliseArray(opsR.value));
      if (liveR.status === "fulfilled") setLive(liveR.value  || {});
      setLastFetch(new Date());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:fsid-toggle", h);
    return () => window.removeEventListener("jarvis:fsid-toggle", h);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const assess = async () => {
    setAssessing(true);
    setAssessment("");
    const critRisk = risks.filter((r) => (r.severity || "").toLowerCase() === "critical").length;
    const critOps  = ops.filter((o) => (o.severity || o.level || "").toLowerCase() === "critical").length;
    const quakes   = Array.isArray(live?.earthquakes) ? live.earthquakes.length : 0;
    const prompt =
      `Full-Stack Intelligence Dashboard: ${risks.length} risk signals (${critRisk} critical), ` +
      `${invs.length} open investigations, ${ops.length} ops events (${critOps} critical), ` +
      `${quakes} seismic events active. DEFCON state: ${defconLabel(dc)}. ` +
      `Top risk: ${risks[0]?.title || risks[0]?.name || "none"}. ` +
      `Top investigation: ${invs[0]?.title || invs[0]?.name || "none"}. ` +
      `Give a 3-sentence cross-domain operational brief — formal British tone.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      }).then((r) => r.json());
      const txt = r?.response || r?.answer || r?.message || r?.content || JSON.stringify(r);
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  };

  const critSvc  = sysCritical(sys);
  const critRisk = risks.filter((r) => (r.severity || "").toLowerCase() === "critical").length;
  const highRisk = risks.filter((r) => (r.severity || "").toLowerCase() === "high").length;
  const critOps  = ops.filter((o) => (o.severity || o.level || "").toLowerCase() === "critical").length;
  const dc       = defcon(critSvc, critRisk, critOps, highRisk);
  const dcColor  = defconColor(dc);
  const quakes   = Array.isArray(live?.earthquakes) ? live.earthquakes : [];
  const crypto   = Array.isArray(live?.crypto)      ? live.crypto      : [];
  const fx       = Array.isArray(live?.fx)          ? live.fx          : [];

  const badgePulse = dc <= 2;

  const topRisks  = risks.slice(0, 5);
  const topInvs   = invs.slice(0, 5);
  const topOps    = ops.slice(0, 5);
  const topQuakes = quakes.slice(0, 3);
  const topCrypto = crypto.slice(0, 3);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Full-Stack Intelligence Dashboard"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 18,
          zIndex: 68,
          background: badgePulse
            ? `rgba(${dc === 1 ? "239,68,68" : "245,158,11"},0.18)`
            : "rgba(15,23,42,0.85)",
          border: `1px solid ${badgePulse ? dcColor : "rgba(255,255,255,0.12)"}`,
          borderRadius: 8,
          color: badgePulse ? dcColor : "#e2e8f0",
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          letterSpacing: 1,
          animation: badgePulse ? "pulse 2s infinite" : "none",
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dcColor,
            boxShadow: `0 0 6px ${dcColor}`,
            display: "inline-block",
          }}
        />
        FSID
        <span
          style={{
            background: dcColor,
            color: "#0f172a",
            borderRadius: 9,
            padding: "0 5px",
            fontSize: 10,
            fontWeight: 700,
            marginLeft: 2,
          }}
        >
          D{dc}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 680,
            maxHeight: "85vh",
            overflowY: "auto",
            background: "rgba(10,15,30,0.97)",
            border: `1px solid ${badgePulse ? dcColor + "55" : "rgba(255,255,255,0.12)"}`,
            borderRadius: 14,
            zIndex: 9700,
            color: "#e2e8f0",
            fontFamily: "monospace",
            backdropFilter: "blur(20px)",
            boxShadow: `0 0 60px rgba(0,0,0,0.7), 0 0 20px ${dcColor}22`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 18px 10px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              background: `linear-gradient(90deg, ${dcColor}11 0%, transparent 60%)`,
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: CY }}>
                ⬟ FULL-STACK INTELLIGENCE DASHBOARD
              </span>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>
                5-stream situational awareness · 60s refresh
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* DEFCON badge */}
              <span
                style={{
                  background: `${dcColor}22`,
                  border: `1px solid ${dcColor}55`,
                  color: dcColor,
                  borderRadius: 8,
                  padding: "3px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                DEFCON {dc} · {defconLabel(dc)}
              </span>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: "rgba(41,231,255,0.15)",
                  border: "1px solid rgba(41,231,255,0.35)",
                  borderRadius: 6,
                  color: CY,
                  padding: "3px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {assessing ? "…" : "▶ BRIEF"}
              </button>
              <button
                onClick={() => { setOpen(false); setAssessment(""); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94a3b8",
                  fontSize: 16,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "12px 16px 8px", flexWrap: "wrap" }}>
            {[
              { label: "RISK SIGNALS", val: risks.length,  sub: `${critRisk} critical`, color: critRisk > 0 ? RED : BLU },
              { label: "CASES",        val: invs.length,   sub: "open investigations",  color: "#94a3b8" },
              { label: "OPS EVENTS",   val: ops.length,    sub: `${critOps} critical`,  color: critOps > 0 ? RED : AMB },
              { label: "SEISMIC",      val: quakes.length, sub: "live events",          color: PRP },
              { label: "CRYPTO",       val: crypto.length, sub: "tracked pairs",        color: GRN },
              { label: "FX",           val: fx.length,     sub: "currency pairs",       color: "#f472b6" },
            ].map(({ label, val, sub, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>{label}</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 1 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Assessment */}
          {assessment && (
            <div
              style={{
                margin: "0 16px 10px",
                padding: "10px 12px",
                background: "rgba(41,231,255,0.08)",
                border: "1px solid rgba(41,231,255,0.2)",
                borderRadius: 8,
                fontSize: 12,
                color: "#67e8f9",
                lineHeight: 1.5,
              }}
            >
              {assessment}
            </div>
          )}

          {loading && <div style={{ padding: "8px 18px", color: "#64748b", fontSize: 12 }}>Loading streams…</div>}
          {err && <div style={{ padding: "8px 18px", color: RED, fontSize: 12 }}>Error: {err}</div>}

          {/* RISK SIGNALS section */}
          <div style={SEC}>
            <div
              style={{ ...SEC_HDR, color: critRisk > 0 ? RED : "#e2e8f0", display: "flex", justifyContent: "space-between" }}
            >
              <span>⚠ RISK SIGNALS ({risks.length})</span>
              <button
                onClick={() => setExpanded(expanded === "risk" ? null : "risk")}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11 }}
              >
                {expanded === "risk" ? "▲ less" : "▼ more"}
              </button>
            </div>
            {(expanded === "risk" ? risks.slice(0, 12) : topRisks).map((r, i) => {
              const sev = r.severity || r.level || "";
              const sc  = sevColor(sev);
              return (
                <div key={i} style={ITEM}>
                  <span style={{ ...PILL, background: `${sc}18`, color: sc, border: `1px solid ${sc}44` }}>
                    {sev.toUpperCase() || "?"}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.title || r.name || r.id || `signal-${i}`}
                  </span>
                </div>
              );
            })}
            {!expanded && risks.length > 5 && (
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                +{risks.length - 5} more signals
              </div>
            )}
          </div>

          {/* INVESTIGATIONS section */}
          <div style={SEC}>
            <div
              style={{ ...SEC_HDR, color: "#e2e8f0", display: "flex", justifyContent: "space-between" }}
            >
              <span>⊗ OPEN INVESTIGATIONS ({invs.length})</span>
              <button
                onClick={() => setExpanded(expanded === "inv" ? null : "inv")}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11 }}
              >
                {expanded === "inv" ? "▲ less" : "▼ more"}
              </button>
            </div>
            {(expanded === "inv" ? invs.slice(0, 12) : topInvs).map((inv, i) => {
              const status = (inv.status || inv.state || "").toUpperCase();
              const sc = status.includes("OPEN") || status.includes("ACTIVE") ? GRN : "#94a3b8";
              return (
                <div key={i} style={ITEM}>
                  {status && (
                    <span style={{ ...PILL, background: `${sc}18`, color: sc, border: `1px solid ${sc}44` }}>
                      {status || "OPEN"}
                    </span>
                  )}
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.title || inv.name || inv.id || `case-${i}`}
                  </span>
                </div>
              );
            })}
            {!expanded && invs.length > 5 && (
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                +{invs.length - 5} more cases
              </div>
            )}
          </div>

          {/* OPS EVENTS section */}
          <div style={SEC}>
            <div
              style={{ ...SEC_HDR, color: critOps > 0 ? AMB : "#e2e8f0", display: "flex", justifyContent: "space-between" }}
            >
              <span>◉ OPS EVENTS ({ops.length})</span>
              <button
                onClick={() => setExpanded(expanded === "ops" ? null : "ops")}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11 }}
              >
                {expanded === "ops" ? "▲ less" : "▼ more"}
              </button>
            </div>
            {(expanded === "ops" ? ops.slice(0, 12) : topOps).map((o, i) => {
              const sev = o.severity || o.level || o.type || "";
              const sc  = sevColor(sev);
              return (
                <div key={i} style={ITEM}>
                  <span style={{ ...PILL, background: `${sc}18`, color: sc, border: `1px solid ${sc}44` }}>
                    {sev.toUpperCase() || "EVT"}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {o.message || o.name || o.title || o.description || o.resource || `event-${i}`}
                  </span>
                </div>
              );
            })}
            {!expanded && ops.length > 5 && (
              <div style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>
                +{ops.length - 5} more events
              </div>
            )}
          </div>

          {/* WORLD INTEL section */}
          <div style={SEC}>
            <div
              style={{ ...SEC_HDR, color: PRP, display: "flex", justifyContent: "space-between" }}
            >
              <span>◈ WORLD INTEL</span>
              <button
                onClick={() => setExpanded(expanded === "world" ? null : "world")}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 11 }}
              >
                {expanded === "world" ? "▲ less" : "▼ more"}
              </button>
            </div>
            {/* Seismic */}
            {(topQuakes.length > 0 || (expanded === "world" && quakes.length > 0)) && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>SEISMIC</div>
                {(expanded === "world" ? quakes.slice(0, 6) : topQuakes).map((q, i) => (
                  <div key={i} style={ITEM}>
                    <span style={{ ...PILL, background: "rgba(167,139,250,0.15)", color: PRP, border: "1px solid rgba(167,139,250,0.3)" }}>
                      M{q.magnitude ?? "?"}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {q.place || q.location || q.region || `quake-${i}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Crypto */}
            {(topCrypto.length > 0 || (expanded === "world" && crypto.length > 0)) && (
              <div>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3 }}>CRYPTO / FX</div>
                {(expanded === "world" ? [...crypto, ...fx].slice(0, 8) : topCrypto).map((c, i) => {
                  const chg = c.change_pct ?? c.change ?? c.pct_change ?? 0;
                  const chgColor = chg >= 0 ? GRN : RED;
                  return (
                    <div key={i} style={ITEM}>
                      <span style={{ ...PILL, background: `${chgColor}18`, color: chgColor, border: `1px solid ${chgColor}44` }}>
                        {chg >= 0 ? "+" : ""}{Number(chg).toFixed(2)}%
                      </span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.symbol || c.pair || c.name || `asset-${i}`}
                      </span>
                      <span style={{ color: "#64748b", fontSize: 10 }}>
                        {c.price != null ? `$${Number(c.price).toLocaleString()}` : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {quakes.length === 0 && crypto.length === 0 && fx.length === 0 && (
              <div style={{ fontSize: 11, color: "#475569" }}>No live world events.</div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: "8px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              color: "#475569",
              fontSize: 10,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>
              {risks.length} risks · {invs.length} cases · {ops.length} ops · {quakes.length + crypto.length + fx.length} world events
            </span>
            <span>
              {lastFetch
                ? `updated ${lastFetch.toLocaleTimeString("en-GB")} · auto-refresh 60s`
                : "auto-refresh 60s"}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
