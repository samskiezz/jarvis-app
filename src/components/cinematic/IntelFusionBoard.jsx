/**
 * F72 — Intelligence Fusion Board
 *
 * Five-source signal aggregator: fuses live data from
 *   /functions/getLiveIntel (seismic + crypto + FX),
 *   /entities/RiskSignal,
 *   /entities/IntelProfile,
 *   /v1/investigations,
 *   /v1/ops/events
 * into a single sortable intelligence stream.
 *
 * Stat tiles: total / seismic / risk / ops.
 * Filter tabs: ALL | SEISMIC | CRYPTO | FX | RISK | INTEL | INV | OPS.
 * Auto-announces new CRITICAL/HIGH items via jarvis:speak-dossier (deduplicated by id).
 * ▶ BRIEF → /v1/jarvis/agent/chat 2-sentence fusion brief + TTS.
 *
 * Toggle:  ◈ IFUSE  at bottom:8 left:17180, zIndex 72.
 * Voice:   "intelligence fusion / fuse intel / intel board / all signals / ifuse"
 * Event:   jarvis:ifuse-toggle
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 17180;
const POLL_MS  = 60_000;

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

const IFUSE_RE =
  /\b(intelligence\s+fusion|fuse\s+intel|intel\s+board|all\s+signals?|ifuse|fusion\s+board|signal\s+aggregat)\b/i;

export function isIfuseQuery(q) { return IFUSE_RE.test(q); }

export async function buildIfuseScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, riskRes, invRes, opsRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
      fetch(`${base}/v1/investigations`,      { headers: hdr }),
      fetch(`${base}/v1/ops/events`,          { headers: hdr }),
    ]);
    const intelRaw = await intelRes.json();
    const riskRaw  = await riskRes.json();
    const invRaw   = await invRes.json();
    const opsRaw   = await opsRes.json();

    const seismic = normaliseSeismic(intelRaw);
    const risks   = normaliseRisks(riskRaw);
    const invs    = normaliseInvs(invRaw);
    const ops     = normaliseOps(opsRaw);
    const totalSignals = seismic.length + risks.length + invs.length + ops.length;
    const criticalCount = [
      ...risks.filter((r) => ["CRITICAL", "HIGH"].includes(r.severity)),
      ...ops.filter((o)   => ["CRITICAL", "HIGH"].includes(o.severity)),
    ].length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS multi-source intelligence fusion: ${totalSignals} total signals across ` +
          `${seismic.length} seismic events, ${risks.length} risk signals, ` +
          `${invs.length} investigations, ${ops.length} ops events. ` +
          `${criticalCount} items rated CRITICAL or HIGH. ` +
          `Give a 2-sentence operational fusion brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Multi-source intelligence fusion is complete, sir.").trim();
  } catch {
    return "Intelligence fusion is temporarily unavailable, sir.";
  }
}

// ── normalise helpers ────────────────────────────────────────────────────────

function normaliseSeismic(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.earthquakes) ? raw.earthquakes
    : Array.isArray(raw?.seismic)     ? raw.seismic
    : Array.isArray(raw?.data)        ? raw.data
    : [];
  return arr.slice(0, 30).map((e, i) => ({
    id:       `seismic-${e.id || i}`,
    source:   "SEISMIC",
    label:    e.place || e.location || e.region || "Unknown region",
    detail:   `M${parseFloat(e.magnitude || e.mag || 0).toFixed(1)} · depth ${e.depth ?? "?"}km`,
    severity: parseFloat(e.magnitude || e.mag || 0) >= 6 ? "CRITICAL"
             : parseFloat(e.magnitude || e.mag || 0) >= 5 ? "HIGH"
             : parseFloat(e.magnitude || e.mag || 0) >= 4 ? "MEDIUM" : "LOW",
    ts:       e.time || e.timestamp || null,
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.risk_signals)         ? raw.risk_signals
    : Array.isArray(raw?.items)                ? raw.items
    : Array.isArray(raw?.results)              ? raw.results
    : [];
  return arr.map((r, i) => ({
    id:       `risk-${r.id || i}`,
    source:   "RISK",
    label:    r.title || r.name || r.signal_name || `Risk ${i + 1}`,
    detail:   r.description || r.category || r.type || "",
    severity: (r.severity || r.level || "LOW").toString().toUpperCase(),
    ts:       r.updated_at || r.created_at || r.timestamp || null,
  }));
}

function normaliseIntelProfiles(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.intel_profiles)       ? raw.intel_profiles
    : Array.isArray(raw?.profiles)             ? raw.profiles
    : Array.isArray(raw?.items)                ? raw.items
    : [];
  return arr.slice(0, 20).map((p, i) => ({
    id:       `intel-${p.id || i}`,
    source:   "INTEL",
    label:    p.name || p.subject || `Profile ${i + 1}`,
    detail:   `${p.type || "Unknown"} · threat: ${p.threat_level || p.threat || "?"}`,
    severity: (p.threat_level || "LOW").toString().toUpperCase(),
    ts:       p.updated_at || p.created_at || null,
  }));
}

function normaliseInvs(raw) {
  const arr = Array.isArray(raw)               ? raw
    : Array.isArray(raw?.data)                 ? raw.data
    : Array.isArray(raw?.investigations)       ? raw.investigations
    : Array.isArray(raw?.items)                ? raw.items
    : [];
  return arr.map((v, i) => ({
    id:       `inv-${v.id || i}`,
    source:   "INV",
    label:    v.title || v.name || `Investigation ${i + 1}`,
    detail:   v.status || v.type || "",
    severity: (v.priority || v.risk_level || "MEDIUM").toString().toUpperCase(),
    ts:       v.updated_at || v.created_at || null,
  }));
}

function normaliseOps(raw) {
  const arr = Array.isArray(raw)       ? raw
    : Array.isArray(raw?.data)         ? raw.data
    : Array.isArray(raw?.events)       ? raw.events
    : Array.isArray(raw?.items)        ? raw.items
    : Array.isArray(raw?.results)      ? raw.results
    : [];
  return arr.slice(0, 40).map((e, i) => ({
    id:       `ops-${e.id || i}`,
    source:   "OPS",
    label:    e.type || e.category || e.event_type || `Event ${i + 1}`,
    detail:   e.message || e.description || e.detail || "",
    severity: (e.severity || e.level || "INFO").toString().toUpperCase(),
    ts:       e.timestamp || e.created_at || e.time || null,
  }));
}

function sevOrder(sev) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4, NOMINAL: 5 }[sev] ?? 6;
}

function sevColor(sev) {
  return { CRITICAL: C.red, HIGH: C.orange, MEDIUM: C.gold, LOW: "#4ADE80",
           INFO: C.blue, NOMINAL: S.text }[sev] ?? S.text;
}

const TABS = ["ALL", "SEISMIC", "RISK", "INTEL", "INV", "OPS"];

// ── component ────────────────────────────────────────────────────────────────

export default function IntelFusionBoard() {
  const [open,      setOpen]      = useState(false);
  const [signals,   setSignals]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const announcedRef = useRef(new Set());
  const timerRef     = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [intelRes, riskRes, intelProfRes, invRes, opsRes] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }).catch(() => null),
        fetch(`${base}/entities/RiskSignal`,    { headers: hdr }).catch(() => null),
        fetch(`${base}/entities/IntelProfile`,  { headers: hdr }).catch(() => null),
        fetch(`${base}/v1/investigations`,      { headers: hdr }).catch(() => null),
        fetch(`${base}/v1/ops/events`,          { headers: hdr }).catch(() => null),
      ]);

      const intelRaw     = intelRes     ? await intelRes.json().catch(() => [])     : [];
      const riskRaw      = riskRes      ? await riskRes.json().catch(() => [])      : [];
      const intelProfRaw = intelProfRes ? await intelProfRes.json().catch(() => []) : [];
      const invRaw       = invRes       ? await invRes.json().catch(() => [])       : [];
      const opsRaw       = opsRes       ? await opsRes.json().catch(() => [])       : [];

      const merged = [
        ...normaliseSeismic(intelRaw),
        ...normaliseRisks(riskRaw),
        ...normaliseIntelProfiles(intelProfRaw),
        ...normaliseInvs(invRaw),
        ...normaliseOps(opsRaw),
      ].sort((a, b) => sevOrder(a.severity) - sevOrder(b.severity));

      setSignals(merged);
      setLastFetch(new Date());

      const newCritical = merged.filter(
        (s) => ["CRITICAL", "HIGH"].includes(s.severity) && !announcedRef.current.has(s.id),
      );
      if (newCritical.length > 0) {
        newCritical.forEach((s) => announcedRef.current.add(s.id));
        const text =
          `JARVIS alert: ${newCritical.length} new critical signal${newCritical.length > 1 ? "s" : ""} ` +
          `detected, sir. Lead: ${newCritical[0].label}.`;
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ifuse-toggle", onToggle);
    return () => window.removeEventListener("jarvis:ifuse-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIfuseQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const visible = signals.filter((s) => filter === "ALL" || s.source === filter);

  const totalCritical = signals.filter((s) =>
    ["CRITICAL", "HIGH"].includes(s.severity)).length;
  const seismicCount  = signals.filter((s) => s.source === "SEISMIC").length;
  const riskCount     = signals.filter((s) => s.source === "RISK").length;
  const opsCount      = signals.filter((s) => s.source === "OPS").length;

  async function assess() {
    setAssessing(true);
    const text = await buildIfuseScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intelligence Fusion Board (◈ IFUSE)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 72,
          background: open ? "rgba(0,150,212,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.blue : S.border}`,
          borderRadius: S.radius, color: open ? C.blue : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.blue}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ IFUSE{totalCritical > 0 && (
          <span style={{
            marginLeft: 4, background: C.red, color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{totalCritical}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 71,
          bottom: 36, left: Math.max(8, BTN_LEFT - 300),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.blue}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "70vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.blue, letterSpacing: 2, fontWeight: 700 }}>
              INTELLIGENCE FUSION
            </span>
            <button
              onClick={assess}
              disabled={assessing || signals.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.neon}`,
                color: C.neon, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || signals.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ BRIEF"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "TOTAL",   val: signals.length, color: C.blue   },
              { label: "SEISMIC", val: seismicCount,   color: C.gold   },
              { label: "RISK",    val: riskCount,      color: C.red    },
              { label: "OPS",     val: opsCount,       color: C.orange },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 3, padding: "0 12px 6px", flexWrap: "wrap" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: "0 0 auto",
                background: filter === t ? `${C.blue}22` : "transparent",
                border: `1px solid ${filter === t ? C.blue : S.border}`,
                color: filter === t ? C.blue : S.text,
                borderRadius: S.radius, padding: "2px 6px",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Signal stream */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && signals.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading fusion…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No signals in this filter.</div>
            ) : visible.map((sig) => (
              <div key={sig.id} style={{
                display: "flex", alignItems: "flex-start", gap: 8,
                padding: "5px 8px", marginBottom: 4, borderRadius: 6,
                background: "rgba(0,0,0,0.25)",
                borderLeft: `3px solid ${sevColor(sig.severity)}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: "flex", alignItems: "center", gap: 6, marginBottom: 2,
                  }}>
                    <span style={{
                      fontSize: "7px", letterSpacing: 1,
                      color: "#fff", background: sevColor(sig.severity),
                      borderRadius: 3, padding: "1px 4px",
                    }}>{sig.severity}</span>
                    <span style={{
                      fontSize: "7px", letterSpacing: 1, color: S.text,
                      background: "rgba(255,255,255,0.06)", borderRadius: 3, padding: "1px 4px",
                    }}>{sig.source}</span>
                  </div>
                  <div style={{
                    color: S.textHi, fontSize: S.fs.xs,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {sig.label}
                  </div>
                  {sig.detail && (
                    <div style={{ color: S.text, fontSize: "8px", marginTop: 1 }}>
                      {sig.detail}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            5 sources · {signals.length} signals · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
