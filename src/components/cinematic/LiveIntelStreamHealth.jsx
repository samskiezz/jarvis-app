/**
 * F122 — Live Intel Stream Health Monitor (LISHM)
 *
 * Parallel-fetches:
 *   /functions/getLiveIntel    → quakes / crypto / FX freshness check
 *   /v1/jarvis/system/status   → service health
 *   /v1/cinematic/brain        → node/synapse counts
 *
 * Computes per-stream freshness (LIVE / STALE / OFFLINE) based on data
 * recency, then surfaces a composite Stream Health Index (0–100).
 * Displays a 3-column source grid (QUAKES / CRYPTO / FX) with status
 * badges, item counts, and a last-seen age indicator.
 *
 * Red badge on offline/stale stream count.
 * ▶ ASSESS HEALTH → /v1/jarvis/agent/chat 2-sentence brief + TTS.
 * 60-s auto-refresh.  jarvis:lishm-toggle event.
 * Voice: "lishm / live intel health / stream health / data freshness / intel stream status".
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 1_011_240;
const Z_INDEX  = 184;
const POLL_MS  = 60_000;
const API_KEY  = import.meta.env.VITE_API_KEY || "";

const LISHM_RE =
  /\b(lishm|live[\s-]intel[\s-]health|stream[\s-]health|data[\s-]freshness|intel[\s-]stream[\s-]status|intel[\s-]stream)\b/i;

// ── colours ───────────────────────────────────────────────────────────────────
const CY     = "#00CFFF";
const GR     = "#22C55E";
const AM     = "#F59E0B";
const RD     = "#EF4444";
const BG     = "rgba(6,11,22,0.97)";
const BORDER = "rgba(0,207,255,0.18)";
const FONT   = "'JetBrains Mono',monospace";

// ── exports for JarvisBrain ───────────────────────────────────────────────────
export function isLishmQuery(text) {
  return LISHM_RE.test(text || "");
}

// ── helpers ───────────────────────────────────────────────────────────────────
function norm(raw, keys) {
  if (Array.isArray(raw)) return raw;
  for (const k of keys) if (Array.isArray(raw?.[k])) return raw[k];
  return [];
}

function statusColor(s) {
  if (s === "LIVE")    return GR;
  if (s === "STALE")   return AM;
  return RD;
}

function ageLabel(ts) {
  if (!ts) return "unknown";
  const sec = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (sec < 60)   return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

function freshnessStatus(items) {
  if (!items || items.length === 0) return "OFFLINE";
  const times = items.map(i => i.time || i.timestamp || i.created_at || i.date).filter(Boolean);
  if (!times.length) return "LIVE"; // has data but no timestamps → assume live
  const newest = Math.max(...times.map(t => new Date(t).getTime()));
  const ageSec = (Date.now() - newest) / 1000;
  if (ageSec < 600)   return "LIVE";
  if (ageSec < 3600)  return "STALE";
  return "OFFLINE";
}

function newestTimestamp(items) {
  if (!items || !items.length) return null;
  const times = items.map(i => i.time || i.timestamp || i.created_at || i.date).filter(Boolean);
  if (!times.length) return null;
  return new Date(Math.max(...times.map(t => new Date(t).getTime()))).toISOString();
}

// ── async script builder ──────────────────────────────────────────────────────
export async function buildLishmScript() {
  const base = apiBase();
  const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
  const [intelR, sysR, brainR] = await Promise.allSettled([
    fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/jarvis/system/status`, { headers }).then(r => r.json()),
    fetch(`${base}/v1/cinematic/brain`,      { headers }).then(r => r.json()),
  ]);

  const intel = intelR.status === "fulfilled" ? intelR.value : null;
  const sys   = sysR.status   === "fulfilled" ? sysR.value   : null;
  const brain = brainR.status === "fulfilled" ? brainR.value : null;

  const quakes = norm(intel?.earthquakes || intel?.quakes, ["earthquakes", "quakes", "data"]);
  const crypto = norm(intel?.crypto || intel?.cryptocurrency, ["crypto", "cryptocurrency", "data"]);
  const fx     = norm(intel?.fx || intel?.forex, ["fx", "forex", "data"]);

  const qStatus = freshnessStatus(quakes);
  const cStatus = freshnessStatus(crypto);
  const fStatus = freshnessStatus(fx);

  const services = Object.values(sys?.services || sys?.components || {});
  const healthyCount = services.filter(s => {
    const v = typeof s === "string" ? s : s?.status || s?.state || "";
    return /running|online|up|healthy|ok/i.test(String(v));
  }).length;

  const nodes    = brain?.nodes    || brain?.node_count    || brain?.total_nodes    || 0;
  const synapses = brain?.synapses || brain?.synapse_count || brain?.total_synapses || 0;

  const offlineCount = [qStatus, cStatus, fStatus].filter(s => s !== "LIVE").length;
  const streamHealth = Math.round(([qStatus, cStatus, fStatus].filter(s => s === "LIVE").length / 3) * 100);

  let summary = `Live Intel Stream Health Monitor: `;
  if (offlineCount === 0) {
    summary += `All three streams LIVE — quakes (${quakes.length} events), crypto (${crypto.length} pairs), FX (${fx.length} rates). `;
  } else {
    const offline = [];
    if (qStatus !== "LIVE") offline.push("seismic");
    if (cStatus !== "LIVE") offline.push("crypto");
    if (fStatus !== "LIVE") offline.push("FX");
    summary += `${offlineCount} stream${offlineCount > 1 ? "s" : ""} degraded: ${offline.join(", ")}. `;
  }
  summary += `System reports ${healthyCount} healthy service${healthyCount !== 1 ? "s" : ""}, brain at ${nodes} nodes and ${synapses} synapses. `;
  summary += `Overall stream health index: ${streamHealth} percent.`;
  return summary;
}

// ── component ─────────────────────────────────────────────────────────────────
export default function LiveIntelStreamHealth() {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [assessing, setAssessing] = useState(false);
  const [brief,   setBrief]   = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const base = apiBase();
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};
    const [intelR, sysR, brainR] = await Promise.allSettled([
      fetch(`${base}/functions/getLiveIntel`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/jarvis/system/status`, { headers }).then(r => r.json()),
      fetch(`${base}/v1/cinematic/brain`,      { headers }).then(r => r.json()),
    ]);
    const intel = intelR.status === "fulfilled" ? intelR.value : null;
    const sys   = sysR.status   === "fulfilled" ? sysR.value   : null;
    const brain = brainR.status === "fulfilled" ? brainR.value : null;

    const quakes = norm(intel?.earthquakes || intel?.quakes, ["earthquakes", "quakes", "data"]);
    const crypto = norm(intel?.crypto || intel?.cryptocurrency, ["crypto", "cryptocurrency", "data"]);
    const fx     = norm(intel?.fx || intel?.forex, ["fx", "forex", "data"]);

    const services = Object.values(sys?.services || sys?.components || {});
    const healthySvc = services.filter(s => {
      const v = typeof s === "string" ? s : s?.status || s?.state || "";
      return /running|online|up|healthy|ok/i.test(String(v));
    }).length;

    const nodes    = brain?.nodes    || brain?.node_count    || brain?.total_nodes    || 0;
    const synapses = brain?.synapses || brain?.synapse_count || brain?.total_synapses || 0;

    setData({ quakes, crypto, fx, services, healthySvc, nodes, synapses });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:lishm-toggle", onToggle);
    return () => window.removeEventListener("jarvis:lishm-toggle", onToggle);
  }, []);

  const assess = useCallback(async () => {
    if (!data) return;
    setAssessing(true);
    setBrief("");
    const base = apiBase();
    const headers = API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {};

    const qStatus = freshnessStatus(data.quakes);
    const cStatus = freshnessStatus(data.crypto);
    const fStatus = freshnessStatus(data.fx);
    const streamHealth = Math.round([qStatus, cStatus, fStatus].filter(s => s === "LIVE").length / 3 * 100);

    const ctx = `Live Intel Stream Health: Quakes ${qStatus} (${data.quakes.length}), ` +
      `Crypto ${cStatus} (${data.crypto.length}), FX ${fStatus} (${data.fx.length}). ` +
      `System services: ${data.healthySvc}/${data.services.length} healthy. ` +
      `Brain: ${data.nodes} nodes, ${data.synapses} synapses. Stream index: ${streamHealth}%.`;
    try {
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ message: `Assess this live data stream health in 2 sentences: ${ctx}` }),
      });
      const j = await r.json();
      const txt = j.response || j.message || j.content || "Stream health assessment complete.";
      setBrief(txt);
      // speak
      fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: txt }),
      }).then(async res => {
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play().catch(() => {});
      }).catch(() => {});
    } catch {
      setBrief("Live intel stream health assessment unavailable.");
    }
    setAssessing(false);
  }, [data]);

  if (!open) {
    const offCount = data
      ? [freshnessStatus(data.quakes), freshnessStatus(data.crypto), freshnessStatus(data.fx)]
          .filter(s => s !== "LIVE").length
      : 0;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Live Intel Stream Health Monitor (F122)"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          fontFamily: FONT, fontSize: 10, letterSpacing: 2,
          background: "rgba(6,11,22,0.82)", border: `1px solid ${CY}44`,
          color: CY, padding: "4px 10px", borderRadius: 4, cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ LISHM
        {offCount > 0 && (
          <span style={{
            marginLeft: 5, background: RD, color: "#fff", borderRadius: 10,
            padding: "1px 6px", fontSize: 9,
          }}>{offCount}</span>
        )}
      </button>
    );
  }

  const qStatus = data ? freshnessStatus(data.quakes) : "OFFLINE";
  const cStatus = data ? freshnessStatus(data.crypto) : "OFFLINE";
  const fStatus = data ? freshnessStatus(data.fx)     : "OFFLINE";
  const streamHealth = data
    ? Math.round([qStatus, cStatus, fStatus].filter(s => s === "LIVE").length / 3 * 100)
    : 0;
  const offCount = [qStatus, cStatus, fStatus].filter(s => s !== "LIVE").length;

  const streams = [
    { label: "QUAKES",  status: qStatus, items: data?.quakes || [], icon: "⟐" },
    { label: "CRYPTO",  status: cStatus, items: data?.crypto || [], icon: "◈" },
    { label: "FX",      status: fStatus, items: data?.fx     || [], icon: "◉" },
  ];

  return (
    <div style={{
      position: "fixed", left: 18, bottom: 58, zIndex: Z_INDEX,
      width: "min(560px, 94vw)", maxHeight: "70vh",
      background: BG, border: `1px solid ${BORDER}`,
      borderRadius: 14, fontFamily: FONT, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: `0 0 40px ${CY}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 16px 8px", borderBottom: `1px solid ${BORDER}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: CY, fontSize: 12, letterSpacing: 3, fontWeight: 700,
            textShadow: `0 0 12px ${CY}` }}>◈ LIVE INTEL STREAM HEALTH</span>
          {offCount > 0 && (
            <span style={{
              background: RD, color: "#fff", borderRadius: 10, padding: "1px 7px",
              fontSize: 9, letterSpacing: 1, animation: "lishm-pulse 1.4s ease-in-out infinite",
            }}>{offCount} DEGRADED</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: "#4E6A7A", letterSpacing: 1 }}>
            {loading ? "⟳ refreshing…" : "◌ 60s poll"}
          </span>
          <button onClick={load} title="Refresh" style={{
            background: "none", border: `1px solid ${CY}44`, color: CY,
            fontSize: 10, cursor: "pointer", borderRadius: 4, padding: "2px 8px",
          }}>↺</button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: "#4E6A7A",
            fontSize: 16, cursor: "pointer", lineHeight: 1,
          }}>✕</button>
        </div>
      </div>

      {/* stream index bar */}
      <div style={{ padding: "8px 16px 4px", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <span style={{ color: "#4E6A7A", fontSize: 9, letterSpacing: 2 }}>STREAM INDEX</span>
          <span style={{
            fontSize: 18, fontWeight: 700, color: streamHealth >= 67 ? GR : streamHealth >= 34 ? AM : RD,
            textShadow: `0 0 10px ${streamHealth >= 67 ? GR : streamHealth >= 34 ? AM : RD}`,
          }}>{streamHealth}%</span>
          <span style={{ fontSize: 9, color: "#4E6A7A" }}>
            SYS {data?.healthySvc ?? "…"}/{data?.services?.length ?? "…"} healthy ·
            BRAIN {data?.nodes ?? "…"} nodes
          </span>
        </div>
        <div style={{ height: 3, background: "#0D1F2D", borderRadius: 2, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${streamHealth}%`,
            background: streamHealth >= 67 ? GR : streamHealth >= 34 ? AM : RD,
            transition: "width .5s ease",
          }} />
        </div>
      </div>

      {/* 3-column stream grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10,
        padding: "12px 16px", overflowY: "auto", flex: 1,
      }}>
        {streams.map(({ label, status, items, icon }) => {
          const newest = newestTimestamp(items);
          return (
            <div key={label} style={{
              background: `${statusColor(status)}0A`,
              border: `1px solid ${statusColor(status)}44`,
              borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: statusColor(status), letterSpacing: 2, fontWeight: 700 }}>
                  {icon} {label}
                </span>
                <span style={{
                  fontSize: 8, letterSpacing: 1, padding: "1px 5px", borderRadius: 10,
                  background: `${statusColor(status)}22`, color: statusColor(status),
                }}>{status}</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#DCEBF5", marginBottom: 4 }}>
                {items.length}
              </div>
              <div style={{ fontSize: 9, color: "#4E6A7A" }}>
                {newest ? ageLabel(newest) : items.length > 0 ? "data present" : "no data"}
              </div>
              {items.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {items.slice(0, 3).map((item, i) => (
                    <div key={i} style={{
                      fontSize: 9, color: "#6E8AA0", padding: "2px 0",
                      borderTop: i > 0 ? "1px solid #0D1F2D" : "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {item.place || item.symbol || item.pair || item.name ||
                       item.title || item.currency || `item ${i + 1}`}
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div style={{ fontSize: 9, color: "#4E6A7A", paddingTop: 2 }}>
                      +{items.length - 3} more
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* assess + brief */}
      <div style={{ padding: "8px 16px 12px", borderTop: `1px solid ${BORDER}` }}>
        <button
          onClick={assess}
          disabled={assessing || !data}
          style={{
            background: `${CY}18`, border: `1px solid ${CY}44`, color: CY,
            fontSize: 10, letterSpacing: 2, cursor: assessing ? "wait" : "pointer",
            borderRadius: 4, padding: "5px 14px", fontFamily: FONT,
          }}
        >
          {assessing ? "⟳ ASSESSING…" : "▶ ASSESS STREAM HEALTH"}
        </button>
        {brief && (
          <div style={{
            marginTop: 8, fontSize: 11, color: "#DCEBF5", lineHeight: 1.5,
            background: `${CY}08`, border: `1px solid ${CY}22`,
            borderRadius: 6, padding: "8px 10px",
          }}>{brief}</div>
        )}
      </div>

      <style>{`
        @keyframes lishm-pulse {
          0%,100%{opacity:1}50%{opacity:.45}
        }
      `}</style>
    </div>
  );
}
