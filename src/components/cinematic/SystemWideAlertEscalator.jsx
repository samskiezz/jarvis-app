/**
 * F114 — System-Wide Alert Escalation Queue (ALESCQ)
 *
 * Parallel-fetches /v1/jarvis/system/status + /entities/RiskSignal
 *                + /v1/ops/events + /v1/investigations.
 * Merges all sources into a unified priority-sorted escalation queue:
 *   CRITICAL  — service down (system) or CRITICAL-severity risk signal
 *   HIGH      — HIGH-severity risk signal or flagged investigation
 *   MEDIUM    — MEDIUM-severity risk signal or active ops event
 *   INFO      — everything else (LOW signals, open investigations)
 *
 * Source-type badges: SYSTEM / RISK / OPS / CASE.
 * Each row shows severity pill + source badge + title + timestamp.
 * ▶ ESCALATE button on each row → /v1/jarvis/agent/chat triage brief + TTS.
 * Global ▶ ASSESS ALL → 2-sentence full-queue brief + TTS.
 * Filter tabs ALL / SYSTEM / RISK / OPS / CASE.
 * Red badge on CRITICAL+HIGH unescalated count.
 * 60-s auto-refresh. jarvis:alescq-toggle event.
 *
 * Voice trigger: "alescq / escalation queue / alert queue / escalate / all alerts / critical escalation".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_006_760;
const Z_INDEX  = 176;
const POLL_MS  = 60_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const ALESCQ_RE = /\b(alescq|escalation[\s-]queue|alert[\s-]queue|escalate|all[\s-]alerts|critical[\s-]escalation)\b/i;

// ── colour palette ────────────────────────────────────────────────────────────
const CY    = "#00CFFF";
const RD    = "#EF4444";
const OR    = "#F97316";
const AM    = "#F59E0B";
const GR    = "#22C55E";
const MG    = "#A78BFA";
const BL    = "#3B82F6";
const TE    = "#14B8A6";
const BG    = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT  = "'JetBrains Mono',monospace";

const SEV_COLOR = { CRITICAL: RD, HIGH: OR, MEDIUM: AM, INFO: TE };
const SRC_COLOR = { SYSTEM: MG, RISK: RD, OPS: BL, CASE: CY };

const TABS = ["ALL", "SYSTEM", "RISK", "OPS", "CASE"];

// ── exports for JarvisBrain ───────────────────────────────────────────────────

export function isAlescqQuery(text) {
  return ALESCQ_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────

function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function severityFromSignal(sig) {
  const s = String(sig?.severity || sig?.level || "").toUpperCase();
  if (s === "CRITICAL") return "CRITICAL";
  if (s === "HIGH")     return "HIGH";
  if (s === "MEDIUM")   return "MEDIUM";
  return "INFO";
}

function severityOrder(sev) {
  return { CRITICAL: 0, HIGH: 1, MEDIUM: 2, INFO: 3 }[sev] ?? 3;
}

async function fetchAll() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();

  const [sysRes, riskRes, opsRes, invRes] = await Promise.allSettled([
    fetch(`${base}/v1/jarvis/system/status`,  { headers }).then(r => r.json()),
    fetch(`${base}/entities/RiskSignal`,       { headers }).then(r => r.json()),
    fetch(`${base}/v1/ops/events`,             { headers }).then(r => r.json()),
    fetch(`${base}/v1/investigations`,         { headers }).then(r => r.json()),
  ]);

  const items = [];

  // SYSTEM — offline / degraded services
  if (sysRes.status === "fulfilled") {
    const sd = sysRes.value;
    const services = sd?.services || sd?.components || [];
    if (Array.isArray(services)) {
      services.forEach(svc => {
        const status = String(svc?.status || svc?.state || "").toLowerCase();
        if (status === "offline" || status === "down" || status === "error" || status === "degraded") {
          items.push({
            id: `sys-${svc.name || svc.id}`,
            source: "SYSTEM",
            severity: status === "degraded" ? "HIGH" : "CRITICAL",
            title: `${svc.name || svc.id || "Service"} — ${status.toUpperCase()}`,
            detail: svc?.message || svc?.detail || "No additional detail.",
            timestamp: svc?.updated_at || svc?.timestamp || null,
            raw: svc,
          });
        }
      });
    }
    // Also check top-level status field
    const topStatus = String(sd?.status || "").toLowerCase();
    if (topStatus && topStatus !== "ok" && topStatus !== "healthy" && topStatus !== "online") {
      items.push({
        id: "sys-overall",
        source: "SYSTEM",
        severity: topStatus === "degraded" ? "HIGH" : "CRITICAL",
        title: `JARVIS System — ${topStatus.toUpperCase()}`,
        detail: sd?.message || "System health check indicates issues.",
        timestamp: sd?.updated_at || null,
        raw: sd,
      });
    }
  }

  // RISK SIGNALS
  const signals = norm(riskRes.status === "fulfilled" ? riskRes.value : [], ["signals","items","data","results"]);
  signals.forEach(sig => {
    items.push({
      id: `risk-${sig.id || sig._id || sig.name}`,
      source: "RISK",
      severity: severityFromSignal(sig),
      title: sig.title || sig.name || sig.signal || "Unnamed Signal",
      detail: sig.description || sig.detail || sig.summary || "",
      timestamp: sig.created_at || sig.timestamp || sig.updated_at || null,
      raw: sig,
    });
  });

  // OPS EVENTS
  const ops = norm(opsRes.status === "fulfilled" ? opsRes.value : [], ["events","items","data","results"]);
  ops.forEach(ev => {
    const sev = String(ev?.severity || ev?.level || ev?.priority || "").toUpperCase();
    items.push({
      id: `ops-${ev.id || ev._id || ev.event_id}`,
      source: "OPS",
      severity: ["CRITICAL","HIGH","MEDIUM"].includes(sev) ? sev : "MEDIUM",
      title: ev.title || ev.name || ev.event || ev.description || "Ops Event",
      detail: ev.description || ev.summary || ev.detail || "",
      timestamp: ev.timestamp || ev.created_at || ev.event_time || null,
      raw: ev,
    });
  });

  // INVESTIGATIONS
  const invs = norm(invRes.status === "fulfilled" ? invRes.value : [], ["investigations","items","data","results"]);
  invs.forEach(inv => {
    const priority = String(inv?.priority || inv?.status || "").toUpperCase();
    const sev = ["CRITICAL","HIGH"].includes(priority) ? priority : priority === "MEDIUM" ? "MEDIUM" : "INFO";
    items.push({
      id: `case-${inv.id || inv._id || inv.case_id}`,
      source: "CASE",
      severity: sev,
      title: inv.title || inv.name || inv.case_number || "Open Investigation",
      detail: inv.description || inv.summary || "",
      timestamp: inv.opened_at || inv.created_at || inv.updated_at || null,
      raw: inv,
    });
  });

  // Sort: severity first, then by timestamp desc
  items.sort((a, b) => {
    const sd = severityOrder(a.severity) - severityOrder(b.severity);
    if (sd !== 0) return sd;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return items;
}

export async function buildAlescqScript() {
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const base = apiBase();

  const items = await fetchAll();
  const total    = items.length;
  const critical = items.filter(i => i.severity === "CRITICAL").length;
  const high     = items.filter(i => i.severity === "HIGH").length;
  const sysItems = items.filter(i => i.source === "SYSTEM").length;
  const riskItems = items.filter(i => i.source === "RISK").length;
  const opsItems  = items.filter(i => i.source === "OPS").length;
  const caseItems = items.filter(i => i.source === "CASE").length;

  const context = `System-wide alert escalation queue: ${total} total alerts. CRITICAL: ${critical}. HIGH: ${high}. By source — System: ${sysItems}, Risk Signals: ${riskItems}, Ops Events: ${opsItems}, Investigations: ${caseItems}.`;

  const chatHeaders = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
  const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: chatHeaders,
    body: JSON.stringify({ message: `In exactly 2 sentences, give an executive escalation summary based on this data: ${context}. Highlight the most urgent items and recommended immediate actions.` }),
  });
  const data = await resp.json();
  return data?.response || data?.message || data?.content || context;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SystemWideAlertEscalator() {
  const [open, setOpen]         = useState(false);
  const [items, setItems]       = useState([]);
  const [tab, setTab]           = useState("ALL");
  const [loading, setLoading]   = useState(false);
  const [escalating, setEscalating] = useState(null);
  const [assessing, setAssessing]   = useState(false);
  const [brief, setBrief]       = useState("");
  const [rowBriefs, setRowBriefs]   = useState({});
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll();
      setItems(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:alescq-toggle", onToggle);
    return () => window.removeEventListener("jarvis:alescq-toggle", onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  const visible = tab === "ALL" ? items : items.filter(i => i.source === tab);

  const criticalCount = items.filter(i => i.severity === "CRITICAL" || i.severity === "HIGH").length;

  async function escalateRow(item) {
    setEscalating(item.id);
    try {
      const base = apiBase();
      const chatHeaders = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      const resp = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: chatHeaders,
        body: JSON.stringify({ message: `Triage this alert in exactly 2 sentences — provide severity assessment and immediate action recommendation: Source: ${item.source}. Severity: ${item.severity}. Title: ${item.title}. Detail: ${item.detail || "N/A"}.` }),
      });
      const data = await resp.json();
      const msg = data?.response || data?.message || data?.content || `${item.severity} alert from ${item.source}: ${item.title}`;
      setRowBriefs(prev => ({ ...prev, [item.id]: msg }));
      // Speak via TTS
      const ttsHeaders = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: ttsHeaders,
        body: JSON.stringify({ text: msg, voice: localStorage.getItem("jarvis_voice") || "ash" }),
      }).then(r => r.json()).then(d => {
        if (d?.audio_url || d?.url) {
          const audio = new Audio(d.audio_url || d.url);
          audio.play().catch(() => {});
        }
      }).catch(() => {});
    } catch { /* ignore */ }
    finally { setEscalating(null); }
  }

  async function assessAll() {
    setAssessing(true);
    try {
      const script = await buildAlescqScript();
      setBrief(script);
      const base = apiBase();
      const ttsHeaders = { "Content-Type": "application/json", ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}) };
      await fetch(`${base}/v1/voice/tts`, {
        method: "POST",
        headers: ttsHeaders,
        body: JSON.stringify({ text: script, voice: localStorage.getItem("jarvis_voice") || "ash" }),
      }).then(r => r.json()).then(d => {
        if (d?.audio_url || d?.url) {
          const audio = new Audio(d.audio_url || d.url);
          audio.play().catch(() => {});
        }
      }).catch(() => {});
    } catch { /* ignore */ }
    finally { setAssessing(false); }
  }

  function fmtTime(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: Z_INDEX,
          background: criticalCount > 0 ? "rgba(239,68,68,0.18)" : "rgba(6,11,22,0.85)",
          border: `1px solid ${criticalCount > 0 ? RD : BORDER}`,
          color: criticalCount > 0 ? RD : CY,
          fontFamily: FONT,
          fontSize: 11,
          padding: "4px 10px",
          borderRadius: 4,
          cursor: "pointer",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
        title="System-Wide Alert Escalation Queue (ALESCQ)"
      >
        {criticalCount > 0 && (
          <span style={{
            background: RD,
            color: "#fff",
            borderRadius: "50%",
            width: 16,
            height: 16,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            fontWeight: 700,
            animation: "pulse 1.2s ease-in-out infinite",
          }}>{criticalCount > 9 ? "9+" : criticalCount}</span>
        )}
        ◈ ALESCQ
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed",
          bottom: 40,
          right: 16,
          width: 560,
          maxHeight: "72vh",
          background: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 8,
          zIndex: Z_INDEX + 1,
          display: "flex",
          flexDirection: "column",
          fontFamily: FONT,
          fontSize: 12,
          color: CY,
          boxShadow: "0 4px 32px rgba(0,0,0,0.7)",
          overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: RD }}>◈ ALERT ESCALATION QUEUE</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={assessAll} disabled={assessing || loading} style={{ background: "none", border: `1px solid ${CY}`, color: CY, fontFamily: FONT, fontSize: 11, padding: "2px 10px", borderRadius: 4, cursor: "pointer" }}>
                {assessing ? "…" : "▶ ASSESS ALL"}
              </button>
              <button onClick={load} disabled={loading} style={{ background: "none", border: `1px solid ${BORDER}`, color: CY, fontFamily: FONT, fontSize: 11, padding: "2px 8px", borderRadius: 4, cursor: "pointer" }}>⟳</button>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: CY, cursor: "pointer", fontSize: 14 }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, flexWrap: "wrap" }}>
            {[
              { label: "TOTAL",    val: items.length,                                  c: CY },
              { label: "CRITICAL", val: items.filter(i => i.severity === "CRITICAL").length, c: RD },
              { label: "HIGH",     val: items.filter(i => i.severity === "HIGH").length,     c: OR },
              { label: "MEDIUM",   val: items.filter(i => i.severity === "MEDIUM").length,   c: AM },
              { label: "SYSTEM",   val: items.filter(i => i.source === "SYSTEM").length,     c: MG },
              { label: "RISK",     val: items.filter(i => i.source === "RISK").length,       c: RD },
              { label: "OPS",      val: items.filter(i => i.source === "OPS").length,        c: BL },
              { label: "CASE",     val: items.filter(i => i.source === "CASE").length,       c: CY },
            ].map(t => (
              <div key={t.label} style={{ background: "rgba(0,207,255,0.06)", border: `1px solid ${BORDER}`, borderRadius: 4, padding: "3px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(0,207,255,0.5)" }}>{t.label}</div>
                <div style={{ fontWeight: 700, color: t.c, fontSize: 13 }}>{t.val}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 6, padding: "6px 14px", borderBottom: `1px solid ${BORDER}` }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                background: tab === t ? CY : "transparent",
                color: tab === t ? "#060B16" : CY,
                border: `1px solid ${tab === t ? CY : BORDER}`,
                fontFamily: FONT, fontSize: 10, padding: "2px 8px", borderRadius: 3, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Brief */}
          {brief && (
            <div style={{ padding: "8px 14px", borderBottom: `1px solid ${BORDER}`, color: GR, fontSize: 11, lineHeight: 1.5 }}>
              {brief}
            </div>
          )}

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && !items.length && (
              <div style={{ padding: 20, textAlign: "center", color: "rgba(0,207,255,0.4)" }}>Loading alerts…</div>
            )}
            {!loading && !visible.length && (
              <div style={{ padding: 20, textAlign: "center", color: "rgba(0,207,255,0.4)" }}>No alerts for this filter.</div>
            )}
            {visible.map(item => (
              <div key={item.id} style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${BORDER}`,
                background: item.severity === "CRITICAL" ? "rgba(239,68,68,0.05)" : "transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                  {/* Severity pill */}
                  <span style={{
                    background: `${SEV_COLOR[item.severity]}22`,
                    border: `1px solid ${SEV_COLOR[item.severity]}`,
                    color: SEV_COLOR[item.severity],
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 10,
                    fontWeight: 700,
                    letterSpacing: 1,
                    animation: item.severity === "CRITICAL" ? "pulse 1.4s ease-in-out infinite" : "none",
                  }}>{item.severity}</span>
                  {/* Source badge */}
                  <span style={{
                    background: `${SRC_COLOR[item.source]}18`,
                    border: `1px solid ${SRC_COLOR[item.source]}`,
                    color: SRC_COLOR[item.source],
                    fontSize: 9,
                    padding: "1px 6px",
                    borderRadius: 10,
                    letterSpacing: 1,
                  }}>{item.source}</span>
                  {/* Title */}
                  <span style={{ flex: 1, color: "#e2e8f0", fontSize: 11, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
                  {/* Time */}
                  {item.timestamp && <span style={{ color: "rgba(0,207,255,0.4)", fontSize: 10, whiteSpace: "nowrap" }}>{fmtTime(item.timestamp)}</span>}
                  {/* Escalate button */}
                  <button
                    onClick={() => escalateRow(item)}
                    disabled={escalating === item.id}
                    style={{
                      background: "none", border: `1px solid ${OR}`, color: OR,
                      fontFamily: FONT, fontSize: 9, padding: "1px 7px", borderRadius: 3,
                      cursor: escalating === item.id ? "wait" : "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {escalating === item.id ? "…" : "▶ ESC"}
                  </button>
                </div>
                {item.detail && (
                  <div style={{ color: "rgba(0,207,255,0.55)", fontSize: 10, marginLeft: 4, marginBottom: rowBriefs[item.id] ? 4 : 0 }}>
                    {String(item.detail).slice(0, 140)}{item.detail.length > 140 ? "…" : ""}
                  </div>
                )}
                {rowBriefs[item.id] && (
                  <div style={{ color: GR, fontSize: 10, marginTop: 4, marginLeft: 4, lineHeight: 1.5 }}>
                    ⟡ {rowBriefs[item.id]}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "4px 14px", borderTop: `1px solid ${BORDER}`, color: "rgba(0,207,255,0.35)", fontSize: 10, display: "flex", justifyContent: "space-between" }}>
            <span>ALESCQ · {visible.length} items · auto-refresh 60 s</span>
            <span>{loading ? "refreshing…" : "live"}</span>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </>
  );
}
