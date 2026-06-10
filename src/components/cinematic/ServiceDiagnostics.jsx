/**
 * ServiceDiagnostics — F27
 * "JARVIS, service health" / "JARVIS, health check" opens a live diagnostics panel.
 * Fetches /v1/jarvis/system/status → extracts per-service health, CPU, memory,
 * load, uptime, and any services[] array the backend returns.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const RED = "#FF3B3B";
const YLW = "#FFD700";
const PRP = "#A855F7";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 30_000;

const DIAG_RE =
  /\bservice.health\b|\bhealth.check\b|\bhealth.of.service|\bshow.diag|\bdiag.panel\b|\bservice.monitor\b|\bservices\b|\bservice.status\b|\bbackend.health\b|\bhealth.board\b/i;

export function isDiagnosticsQuery(text) {
  return DIAG_RE.test(text || "");
}

function dig(obj, ...paths) {
  for (const path of paths) {
    let cur = obj;
    for (const k of path.split(".")) {
      if (cur == null) break;
      cur = cur[k];
    }
    if (cur != null) return cur;
  }
  return undefined;
}

function statusColor(status = "") {
  const s = String(status).toLowerCase();
  if (/ok|online|healthy|running|up|active|good|nominal/i.test(s)) return GRN;
  if (/warn|degraded|slow|partial/i.test(s)) return YLW;
  if (/error|down|fail|offline|critical|dead/i.test(s)) return RED;
  return CY;
}

function statusLabel(status = "") {
  const s = String(status).toLowerCase();
  if (/ok|online|healthy|running|up|active|good|nominal/i.test(s)) return "ONLINE";
  if (/warn|degraded|slow|partial/i.test(s)) return "DEGRADED";
  if (/error|down|fail|offline|critical|dead/i.test(s)) return "OFFLINE";
  return "UNKNOWN";
}

function pctColor(pct) {
  if (pct >= 90) return RED;
  if (pct >= 70) return YLW;
  return GRN;
}

function extractServices(data) {
  if (!data) return [];

  const raw =
    data.services ||
    data.components ||
    data.modules ||
    data.processes ||
    data.workers ||
    null;

  if (Array.isArray(raw)) {
    return raw.map((s, i) => ({
      id:     s.id || s.name || s.service || `svc-${i}`,
      name:   s.name || s.service || s.id || `Service ${i + 1}`,
      status: s.status || s.state || s.health || "unknown",
      latency_ms: s.latency_ms ?? s.latency ?? s.response_time ?? null,
      uptime: s.uptime || s.uptime_str || null,
      version: s.version || null,
      note:   s.note || s.message || s.detail || null,
    }));
  }

  if (raw && typeof raw === "object") {
    return Object.entries(raw).map(([key, val]) => {
      const v = typeof val === "object" && val !== null ? val : { status: val };
      return {
        id:     key,
        name:   key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        status: v.status || v.state || v.health || String(val),
        latency_ms: v.latency_ms ?? v.latency ?? null,
        uptime: v.uptime || null,
        version: v.version || null,
        note:   v.note || v.message || null,
      };
    });
  }

  // Fall back to synthesising "services" from top-level metrics
  const synthetic = [];
  const cpu = dig(data, "cpu_percent", "cpu", "system.cpu_percent");
  const mem = dig(data, "memory.percent", "memory_percent", "mem_percent", "mem");
  const load = dig(data, "load_avg", "load", "system.load_avg", "load_average");
  const uptime = dig(data, "uptime", "uptime_seconds", "process_uptime", "system_uptime");

  const cpuN = cpu != null ? parseFloat(cpu) : NaN;
  const memN = mem != null ? parseFloat(mem) : NaN;

  if (!isNaN(cpuN)) {
    synthetic.push({
      id: "cpu", name: "CPU",
      status: cpuN < 80 ? "ok" : cpuN < 90 ? "warn" : "critical",
      note: `${Math.round(cpuN)}% utilisation`,
    });
  }
  if (!isNaN(memN)) {
    synthetic.push({
      id: "mem", name: "Memory",
      status: memN < 80 ? "ok" : memN < 90 ? "warn" : "critical",
      note: `${Math.round(memN)}% in use`,
    });
  }
  if (load != null) {
    const l = Array.isArray(load) ? parseFloat(load[0]) : parseFloat(load);
    if (!isNaN(l)) {
      synthetic.push({
        id: "load", name: "System Load",
        status: l < 2 ? "ok" : l < 4 ? "warn" : "critical",
        note: `load avg ${l.toFixed(2)}`,
      });
    }
  }
  if (uptime != null) {
    synthetic.push({
      id: "uptime", name: "Process Uptime",
      status: "ok",
      note: typeof uptime === "number"
        ? `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`
        : String(uptime),
    });
  }

  // Any other top-level service-ish keys
  const SKIP = new Set(["cpu_percent","cpu","memory","memory_percent","mem_percent",
    "load_avg","load","uptime","uptime_seconds","process_uptime","system_uptime",
    "timestamp","version","status","environment","host","pid"]);
  for (const [k, v] of Object.entries(data)) {
    if (SKIP.has(k)) continue;
    if (typeof v === "object" && v !== null && (v.status || v.state || v.health)) {
      synthetic.push({
        id: k,
        name: k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        status: v.status || v.state || v.health,
        note: v.note || v.message || null,
      });
    }
  }

  return synthetic;
}

export async function buildDiagnosticsScript() {
  let data = null;
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (r.ok) data = await r.json();
  } catch (_) {}

  if (!data) return "Unable to retrieve diagnostics data at this time, sir.";

  const services = extractServices(data);
  if (!services.length) return "System status retrieved but no service detail available, sir.";

  const online  = services.filter(s => /ok|online|healthy|running|up|active|good|nominal/i.test(s.status)).length;
  const degraded = services.filter(s => /warn|degraded|slow|partial/i.test(s.status)).length;
  const offline  = services.filter(s => /error|down|fail|offline|critical|dead/i.test(s.status)).length;

  const parts = [
    `Diagnostics report: ${services.length} service${services.length !== 1 ? "s" : ""} checked.`,
    `${online} online`,
  ];
  if (degraded) parts.push(`${degraded} degraded`);
  if (offline)  parts.push(`${offline} offline`);
  parts[parts.length - 1] += ".";

  if (offline > 0) {
    const names = services
      .filter(s => /error|down|fail|offline|critical|dead/i.test(s.status))
      .map(s => s.name).slice(0, 3).join(", ");
    parts.push(`Attention required: ${names}.`);
  } else if (degraded > 0) {
    parts.push("All critical services online. Minor degradation detected.");
  } else {
    parts.push("All systems nominal, sir.");
  }

  return parts.join(" ");
}

export default function ServiceDiagnostics() {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastTs,  setLastTs]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/system/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (r.ok) {
        setData(await r.json());
        setLastTs(Date.now());
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, POLL_MS);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (DIAG_RE.test(q)) { setOpen(true); load(); }
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, [load]);

  const services = extractServices(data);
  const online   = services.filter(s => /ok|online|healthy|running|up|active|good|nominal/i.test(s.status)).length;
  const offline  = services.filter(s => /error|down|fail|offline|critical|dead/i.test(s.status)).length;
  const degraded = services.filter(s => /warn|degraded|slow|partial/i.test(s.status)).length;

  const overall = offline > 0 ? RED : degraded > 0 ? YLW : services.length > 0 ? GRN : CY;

  const cpu = dig(data, "cpu_percent", "cpu", "system.cpu_percent");
  const mem = dig(data, "memory.percent", "memory_percent", "mem_percent", "mem");
  const rawLoad = dig(data, "load_avg", "load", "system.load_avg", "load_average");
  const cpuN = cpu != null ? Math.round(parseFloat(cpu)) : null;
  const memN = mem != null ? Math.round(parseFloat(mem)) : null;
  const loadN = rawLoad != null
    ? (Array.isArray(rawLoad) ? parseFloat(rawLoad[0]) : parseFloat(rawLoad))
    : null;

  const ts = lastTs ? new Date(lastTs).toLocaleTimeString("en-GB", { hour12: false }) : null;

  return (
    <>
      {/* Toggle button — bottom strip at left:1532 */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Service Diagnostics (F27)"
        style={{
          position: "fixed", left: 1532, bottom: 18, zIndex: 68,
          background: open ? overall + "cc" : "rgba(5,8,13,0.78)",
          border: `1px solid ${open ? overall : overall + "44"}`,
          borderRadius: 8,
          color: open ? "#04060A" : overall,
          cursor: "pointer",
          padding: "6px 12px", fontSize: 10, letterSpacing: 2,
          fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
          boxShadow: `0 0 20px ${overall}${open ? "88" : "33"}`,
          backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", gap: 6,
          transition: "all 0.2s",
        }}
      >
        <span style={{ fontSize: 12 }}>⬡</span>
        DIAG
        {offline > 0 && (
          <span style={{
            background: RED + "44", color: RED,
            borderRadius: 9, padding: "1px 5px",
            fontSize: 9, fontWeight: 900, minWidth: 16, textAlign: "center",
            animation: "sdpulse 1s ease-in-out infinite",
          }}>
            {offline}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 18, bottom: 72, zIndex: 68,
          width: "min(520px,96vw)", maxHeight: "min(640px,82vh)",
          background: "rgba(4,6,14,0.97)",
          border: `1px solid ${overall}33`,
          borderRadius: 14, overflow: "hidden",
          backdropFilter: "blur(12px)",
          boxShadow: `0 0 60px ${overall}18`,
          fontFamily: "'JetBrains Mono',monospace",
          display: "flex", flexDirection: "column",
        }}>

          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${overall}22`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: "50%",
              background: overall, boxShadow: `0 0 10px ${overall}`,
              display: "inline-block",
              animation: loading ? "sdpulse 1s ease-in-out infinite" : "none",
            }} />
            <span style={{ color: overall, fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
              SERVICE DIAGNOSTICS
            </span>
            <span style={{ marginLeft: "auto", color: "#566878", fontSize: 9 }}>
              {loading ? "SYNCING" : ts ? `UPDATED ${ts}` : "—"} · REFRESH {POLL_MS / 1000}s
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "none", border: "none", color: "#566878",
              cursor: "pointer", fontSize: 14, padding: "0 2px",
            }}>×</button>
          </div>

          {/* System metrics tiles */}
          {(cpuN != null || memN != null || loadN != null) && (
            <div style={{
              display: "flex", gap: 8, padding: "10px 14px",
              borderBottom: `1px solid ${overall}18`,
            }}>
              {cpuN != null && (
                <MetricTile label="CPU" value={`${cpuN}%`} color={pctColor(cpuN)} bar={cpuN} />
              )}
              {memN != null && (
                <MetricTile label="MEM" value={`${memN}%`} color={pctColor(memN)} bar={memN} />
              )}
              {loadN != null && (
                <MetricTile
                  label="LOAD"
                  value={loadN.toFixed(2)}
                  color={loadN < 2 ? GRN : loadN < 4 ? YLW : RED}
                  bar={null}
                />
              )}
              <MetricTile
                label="STATUS"
                value={offline > 0 ? `${offline} DOWN` : degraded > 0 ? `${degraded} WARN` : "NOMINAL"}
                color={overall}
                bar={null}
              />
            </div>
          )}

          {/* Summary row */}
          {services.length > 0 && (
            <div style={{
              padding: "6px 14px", display: "flex", gap: 12,
              borderBottom: `1px solid ${overall}18`,
              fontSize: 9, color: "#566878",
            }}>
              <span>{services.length} SERVICE{services.length !== 1 ? "S" : ""}</span>
              {online > 0   && <span style={{ color: GRN }}>▲ {online} ONLINE</span>}
              {degraded > 0 && <span style={{ color: YLW }}>△ {degraded} DEGRADED</span>}
              {offline > 0  && <span style={{ color: RED }}>▼ {offline} OFFLINE</span>}
              <button onClick={load} style={{
                marginLeft: "auto",
                background: "transparent", border: `1px solid ${CY}33`,
                borderRadius: 5, color: "#566878", padding: "2px 7px",
                fontSize: 9, cursor: "pointer", letterSpacing: 1,
                fontFamily: "'JetBrains Mono',monospace",
              }}>↺</button>
            </div>
          )}

          {/* Service list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!data && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                {loading ? "LOADING DIAGNOSTICS…" : "NO DATA — CHECK CONNECTION"}
              </div>
            )}
            {data && services.length === 0 && (
              <div style={{
                padding: "28px 18px", color: "#4A6070",
                fontSize: 11, textAlign: "center", letterSpacing: 1,
              }}>
                NO SERVICE DETAIL IN RESPONSE
              </div>
            )}

            {services.map((svc) => {
              const col = statusColor(svc.status);
              const lbl = statusLabel(svc.status);
              return (
                <div key={svc.id} style={{
                  padding: "9px 14px",
                  borderBottom: `1px solid ${col}0F`,
                  borderLeft: `3px solid ${col}`,
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: col, boxShadow: `0 0 8px ${col}`,
                      flexShrink: 0,
                      animation: lbl === "OFFLINE" ? "sdpulse 1s ease-in-out infinite" : "none",
                    }} />
                    <span style={{
                      color: "#DCF0FF", fontSize: 12, flex: 1,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      fontWeight: lbl !== "ONLINE" ? 700 : 400,
                    }}>
                      {svc.name}
                    </span>
                    <span style={{
                      fontSize: 9, letterSpacing: 1.5, fontWeight: 700,
                      color: col, background: col + "22",
                      borderRadius: 5, padding: "2px 8px", flexShrink: 0,
                    }}>
                      {lbl}
                    </span>
                  </div>
                  <div style={{
                    display: "flex", gap: 12, flexWrap: "wrap",
                    fontSize: 9, color: "#4A6070",
                  }}>
                    {svc.latency_ms != null && (
                      <span>LATENCY: <span style={{ color: svc.latency_ms > 500 ? YLW : CY }}>{svc.latency_ms}ms</span></span>
                    )}
                    {svc.uptime && (
                      <span>UPTIME: <span style={{ color: GRN }}>{svc.uptime}</span></span>
                    )}
                    {svc.version && (
                      <span>v<span style={{ color: "#7A9AB0" }}>{svc.version}</span></span>
                    )}
                    {svc.note && (
                      <span style={{ color: col + "cc", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {svc.note}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "7px 14px", borderTop: `1px solid ${overall}18`,
            display: "flex", alignItems: "center", gap: 10,
            fontSize: 9, color: "#4A6070",
          }}>
            <span>SOURCE: /v1/jarvis/system/status</span>
            <span style={{ marginLeft: "auto", color: overall + "88" }}>
              {offline === 0 && degraded === 0 ? "ALL SYSTEMS NOMINAL" : `${offline + degraded} REQUIRES ATTENTION`}
            </span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes sdpulse {
          0%,100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.5; }
        }
      `}</style>
    </>
  );
}

function MetricTile({ label, value, color, bar }) {
  return (
    <div style={{
      flex: 1, background: color + "11",
      border: `1px solid ${color}33`,
      borderRadius: 8, padding: "8px 10px",
      display: "flex", flexDirection: "column", gap: 4,
      minWidth: 70,
    }}>
      <div style={{ fontSize: 9, color: "#566878", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ fontSize: 16, color, fontWeight: 700, letterSpacing: 1 }}>{value}</div>
      {bar != null && (
        <div style={{ height: 3, borderRadius: 2, background: color + "22", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${Math.min(100, bar)}%`,
            background: color,
            transition: "width 0.6s ease",
          }} />
        </div>
      )}
    </div>
  );
}
