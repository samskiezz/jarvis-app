/**
 * EndpointLatencyMonitor — F295
 * Directly probes 8 confirmed-real JARVIS endpoints and measures
 * client-side round-trip latency in milliseconds.
 *
 * Distinct from ServiceDiagnostics which reads what the backend reports
 * about itself — this component measures actual response time from the browser.
 *
 * Toggle: ◈ LATENCY button.
 * Voice: "JARVIS, latency" / "JARVIS, api health" / "JARVIS, endpoint health".
 * Probe interval: 60 s.
 * History: last 5 readings per endpoint stored in localStorage.
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFB830";
const RED = "#FF3B3B";
const DIM = "#4A5568";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS   = 60_000;
const HIST_KEY  = "jarvis_latency_history_v1";
const HIST_MAX  = 5;

const LATENCY_RE =
  /\blatency\b|\bapi.health\b|\bendpoint.health\b|\bapi.speed\b|\bapi.status\b|\bresponse.time\b|\bping\b|\bapi.ping\b/i;

const PROBES = [
  { key: "system",       path: "/v1/jarvis/system/status",   label: "system/status"  },
  { key: "brain",        path: "/v1/cinematic/brain",         label: "cinematic/brain" },
  { key: "task",         path: "/entities/Task?limit=1",      label: "entities/Task"  },
  { key: "invest",       path: "/entities/Investigation?limit=1", label: "entities/Investigation" },
  { key: "scenario",     path: "/v1/scenario/list",           label: "scenario/list"  },
  { key: "skill",        path: "/v1/aip/skill",               label: "aip/skill"      },
  { key: "centrality",   path: "/v1/graph/centrality",        label: "graph/centrality" },
  { key: "datasets",     path: "/v1/datasets",                label: "datasets"       },
];

function latencyColor(ms) {
  if (ms === null)  return RED;
  if (ms < 200)     return GRN;
  if (ms < 1000)    return AMB;
  return RED;
}

function trend(history) {
  if (!history || history.length < 2) return "—";
  const last  = history[history.length - 1];
  const prev  = history[history.length - 2];
  if (last === null || prev === null) return "—";
  if (last < prev - 20)  return "↓";
  if (last > prev + 20)  return "↑";
  return "→";
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HIST_KEY) || "{}");
  } catch { return {}; }
}

function saveHistory(hist) {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(hist)); } catch (_) {}
}

async function probeOne(base, probe) {
  const url = `${base}${probe.path}`;
  const t0  = performance.now();
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    const ms = Math.round(performance.now() - t0);
    return { key: probe.key, ms, status: r.status, ok: r.ok };
  } catch (_) {
    return { key: probe.key, ms: null, status: 0, ok: false };
  }
}

async function probeAll() {
  const base = apiBase();
  const results = await Promise.all(PROBES.map(p => probeOne(base, p)));
  return results;
}

export function isLatencyQuery(text) {
  return LATENCY_RE.test(text || "");
}

export async function buildLatencyScript() {
  let results = [];
  try { results = await probeAll(); } catch (_) {}
  if (!results.length) return "Endpoint latency data is unavailable at this time, sir.";

  const ok    = results.filter(r => r.ok);
  const down  = results.filter(r => !r.ok);
  const avg   = ok.length
    ? Math.round(ok.reduce((s, r) => s + (r.ms ?? 0), 0) / ok.length)
    : null;

  const lines = results.map(r => {
    const probe = PROBES.find(p => p.key === r.key);
    const label = probe?.label ?? r.key;
    if (!r.ok || r.ms === null) return `${label}: DOWN`;
    return `${label}: ${r.ms} ms`;
  });

  const summary = `${ok.length} of ${results.length} endpoints healthy.${
    avg !== null ? ` Average response time ${avg} ms.` : ""
  }${down.length ? ` Down: ${down.map(r => PROBES.find(p => p.key === r.key)?.label ?? r.key).join(", ")}.` : ""}`;

  return `${summary} Details: ${lines.join("; ")}.`;
}

export default function EndpointLatencyMonitor() {
  const [open,    setOpen]    = useState(false);
  const [rows,    setRows]    = useState([]);
  const [history, setHistory] = useState(() => loadHistory());
  const [probing, setProbing] = useState(false);
  const timerRef = useRef(null);

  const runProbes = useCallback(async () => {
    setProbing(true);
    try {
      const results = await probeAll();
      setRows(results);
      setHistory(prev => {
        const next = { ...prev };
        results.forEach(r => {
          const arr = [...(next[r.key] || []), r.ms].slice(-HIST_MAX);
          next[r.key] = arr;
        });
        saveHistory(next);
        return next;
      });
    } finally {
      setProbing(false);
    }
  }, []);

  useEffect(() => {
    runProbes();
    timerRef.current = setInterval(runProbes, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [runProbes]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:latency-toggle", fn);
    return () => window.removeEventListener("jarvis:latency-toggle", fn);
  }, []);

  if (!open) {
    const downCount = rows.filter(r => !r.ok).length;
    return (
      <button
        onClick={() => setOpen(true)}
        title="Endpoint Latency Monitor"
        style={{
          position: "fixed",
          left: 55640,
          bottom: 8,
          zIndex: 108,
          background: downCount > 0 ? `${RED}22` : "#0a0a0f",
          border: `1px solid ${downCount > 0 ? RED : DIM}`,
          borderRadius: 4,
          color: downCount > 0 ? RED : CY,
          fontFamily: "monospace",
          fontSize: 10,
          padding: "3px 7px",
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◈ LATENCY{downCount > 0 ? ` ⚠${downCount}` : ""}
        {probing && <span style={{ marginLeft: 4, opacity: 0.6 }}>…</span>}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed",
      right: 20,
      bottom: 48,
      zIndex: 1080,
      width: 460,
      background: "#0a0a0fee",
      border: `1px solid ${CY}44`,
      borderRadius: 8,
      fontFamily: "monospace",
      color: CY,
      padding: 16,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, letterSpacing: 2, color: CY }}>◈ ENDPOINT LATENCY MONITOR</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={runProbes}
            disabled={probing}
            style={{
              background: "none",
              border: `1px solid ${CY}55`,
              borderRadius: 3,
              color: CY,
              fontSize: 9,
              padding: "2px 6px",
              cursor: probing ? "not-allowed" : "pointer",
              opacity: probing ? 0.5 : 1,
            }}
          >
            {probing ? "PROBING…" : "REFRESH"}
          </button>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: DIM,
              fontSize: 14,
              cursor: "pointer",
              lineHeight: 1,
            }}
          >×</button>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
        <thead>
          <tr style={{ color: "#4A5568", textTransform: "uppercase", letterSpacing: 1 }}>
            <th style={{ textAlign: "left",  padding: "2px 6px" }}>Endpoint</th>
            <th style={{ textAlign: "right", padding: "2px 6px" }}>Status</th>
            <th style={{ textAlign: "right", padding: "2px 6px" }}>Latency</th>
            <th style={{ textAlign: "right", padding: "2px 6px" }}>Trend</th>
          </tr>
        </thead>
        <tbody>
          {PROBES.map(probe => {
            const row  = rows.find(r => r.key === probe.key);
            const hist = history[probe.key] || [];
            const ms   = row?.ms ?? null;
            const ok   = row?.ok ?? false;
            const clr  = row ? latencyColor(ms) : DIM;
            const tr   = trend(hist);

            return (
              <tr key={probe.key} style={{ borderTop: `1px solid #ffffff08` }}>
                <td style={{ padding: "4px 6px", color: "#A0AEC0" }}>{probe.label}</td>
                <td style={{ padding: "4px 6px", textAlign: "right" }}>
                  {row ? (
                    <span style={{
                      color: ok ? GRN : RED,
                      background: ok ? `${GRN}18` : `${RED}18`,
                      borderRadius: 3,
                      padding: "1px 5px",
                    }}>
                      {ok ? `${row.status}` : (row.status > 0 ? `${row.status}` : "TIMEOUT")}
                    </span>
                  ) : (
                    <span style={{ color: DIM }}>—</span>
                  )}
                </td>
                <td style={{ padding: "4px 6px", textAlign: "right", color: clr, fontWeight: 600 }}>
                  {ms !== null ? `${ms} ms` : (row ? "—" : "…")}
                </td>
                <td style={{
                  padding: "4px 6px",
                  textAlign: "right",
                  color: tr === "↓" ? GRN : tr === "↑" ? AMB : DIM,
                }}>
                  {tr}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", color: "#4A5568", fontSize: 9 }}>
        <span>
          {rows.filter(r => r.ok).length}/{PROBES.length} UP
          {rows.length > 0 && rows.some(r => r.ok) && (
            <> · avg{" "}
              {Math.round(
                rows.filter(r => r.ok && r.ms !== null).reduce((s, r) => s + r.ms, 0)
                / rows.filter(r => r.ok && r.ms !== null).length
              )} ms
            </>
          )}
        </span>
        <span>Probe interval: {POLL_MS / 1000}s</span>
      </div>
    </div>
  );
}
