/**
 * F435 — System Status × Investigation Bridge (SSIHB)
 *
 * Parallel-fetches /v1/jarvis/system/status (system health, service states)
 * and /v1/investigations (open cases), then keyword-correlates each service /
 * metric name against investigation titles and descriptions to surface:
 *
 *   INVESTIGATED  — degraded/warning service that has an open case
 *   UNMONITORED   — degraded/warning service with NO open investigation (gap)
 *   HEALTHY       — service is green (no investigation needed)
 *
 * Stat tiles: services / investigations / investigated / unmonitored
 * Filter tabs: ALL | INVESTIGATED | UNMONITORED | HEALTHY
 * Expand any service row → matched investigation cards with status badge +
 *   relevance score bar.
 * ▶ ASSESS: 2-sentence infrastructure-investigation brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SSIHB  at left:881200, bottom:8, zIndex:582
 * Event:   jarvis:ssihb-toggle
 * Voice:   "system investigation / status case / ssihb /
 *           system health case / infrastructure investigation /
 *           degraded service case / service investigation"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useState } from "react";

const BTN_LEFT = 881200;
const POLL_MS  = 60_000;
const CY       = "#29E7FF";
const GRN      = "#22c55e";
const AMB      = "#f59e0b";
const RED      = "#ef4444";

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

const SSIHB_RE =
  /\b(system\s+invest|status\s+case|ssihb|system\s+health\s+case|infra\s*structure\s+invest|degraded\s+service\s+case|service\s+invest|system\s+status\s+invest|which\s+services?\s+(have|lack)\s+(case|invest))\b/i;

export function isSsihbQuery(q) { return SSIHB_RE.test(q || ""); }

export async function buildSsihbScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [statRes, invRes] = await Promise.all([
      fetch(`${base}/v1/jarvis/system/status`, { headers: hdr }),
      fetch(`${base}/v1/investigations`,       { headers: hdr }),
    ]);
    const status = await statRes.json();
    const invRaw = await invRes.json();
    const services      = extractServices(status);
    const investigations = normaliseInvestigations(invRaw);
    const degraded = services.filter((s) => s._state !== "healthy");
    const investigated = degraded.filter((s) =>
      investigations.some((inv) => relevance(s, inv) > 0)
    ).length;
    const unmonitored = degraded.length - investigated;
    return (
      `System Status × Investigation Bridge: ${services.length} services tracked, ` +
      `${degraded.length} degraded or in warning state. ` +
      `${investigated} degraded services have open case coverage; ` +
      `${unmonitored} have no investigation — intelligence gap. ` +
      `Give a 2-sentence infrastructure-investigation coverage brief.`
    );
  } catch {
    return "System status investigation bridge online — opening panel now, sir.";
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function extractServices(status) {
  if (!status || typeof status !== "object") return [];
  const services = [];

  // Collect top-level numeric metrics as virtual "services"
  const metricKeys = ["cpu_percent", "memory_percent", "disk_percent",
                      "cpu_usage", "memory_usage", "disk_usage",
                      "load_avg", "load_1m", "load_5m"];
  for (const k of metricKeys) {
    if (typeof status[k] === "number") {
      const pct = status[k];
      const state = pct >= 90 ? "critical" : pct >= 75 ? "warning" : "healthy";
      services.push({ id: k, name: k.replace(/_/g, " "), value: `${pct.toFixed(1)}%`, _state: state });
    }
  }

  // Collect named services list if present
  const svcList = status.services || status.components || status.checks || [];
  if (Array.isArray(svcList)) {
    for (const svc of svcList) {
      const name = svc.name || svc.service || svc.id || "";
      if (!name) continue;
      const st = (svc.status || svc.state || svc.health || "").toLowerCase();
      const state = st.includes("err") || st.includes("fail") || st.includes("down") || st.includes("critical")
        ? "critical"
        : st.includes("warn") || st.includes("degraded") || st.includes("partial")
        ? "warning"
        : "healthy";
      services.push({
        id: `svc:${name}`,
        name,
        value: svc.status || svc.state || st || "unknown",
        _state: state,
        _raw: svc,
      });
    }
  }

  // Fallback: top-level status string
  if (services.length === 0) {
    const topState = (status.status || status.health || "").toLowerCase();
    services.push({
      id: "system",
      name: "system",
      value: topState || "unknown",
      _state: topState.includes("ok") || topState.includes("healthy") ? "healthy" : "warning",
    });
  }

  return services;
}

function normaliseInvestigations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of ["items", "results", "data", "investigations", "cases", "records"]) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

function tokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function relevance(svc, inv) {
  const svcToks = new Set(tokens(svc.name));
  const invToks = [
    ...tokens(inv.title),
    ...tokens(inv.name),
    ...tokens(inv.description),
    ...tokens(inv.summary),
    ...tokens(inv.type),
    ...tokens(inv.category),
    ...tokens(inv.tags),
    ...tokens(inv.subject),
  ];
  if (!svcToks.size || !invToks.length) return 0;
  let hits = 0;
  for (const t of invToks) if (svcToks.has(t)) hits++;
  return hits / Math.max(svcToks.size, invToks.length);
}

// ── styles ────────────────────────────────────────────────────────────────────

const PILL = {
  display: "inline-block",
  padding: "1px 7px",
  borderRadius: 9,
  fontSize: 10,
  fontWeight: 700,
  marginRight: 4,
};
const ROW = {
  padding: "8px 12px",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  cursor: "pointer",
};
const TILE = {
  flex: "1 1 80px",
  background: "rgba(255,255,255,0.05)",
  borderRadius: 8,
  padding: "10px 12px",
  textAlign: "center",
};

function stateColor(state) {
  if (state === "critical") return RED;
  if (state === "warning")  return AMB;
  return GRN;
}

// ── component ─────────────────────────────────────────────────────────────────

export default function SystemStatusInvestigationBridge() {
  const [open,       setOpen]       = useState(false);
  const [services,   setServices]   = useState([]);
  const [invs,       setInvs]       = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState("");
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const [lastFetch,  setLastFetch]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [statRes, invRes] = await Promise.allSettled([
        fetch(`${base}/v1/jarvis/system/status`, { headers: hdr }).then((r) => r.json()),
        fetch(`${base}/v1/investigations`,        { headers: hdr }).then((r) => r.json()),
      ]);
      const svcs  = extractServices(statRes.status  === "fulfilled" ? statRes.value  : {});
      const cases = normaliseInvestigations(invRes.status === "fulfilled" ? invRes.value : []);
      const rich  = svcs.map((svc) => {
        const matches = cases
          .map((inv) => ({ inv, score: relevance(svc, inv) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        const label =
          svc._state === "healthy"
            ? "HEALTHY"
            : matches.length > 0
            ? "INVESTIGATED"
            : "UNMONITORED";
        return { ...svc, _matches: matches, _label: label };
      });
      setServices(svcs);
      setInvs(cases);
      setEnriched(rich);
      setLastFetch(new Date());
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:ssihb-toggle", h);
    return () => window.removeEventListener("jarvis:ssihb-toggle", h);
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
    const degraded      = enriched.filter((s) => s._state !== "healthy");
    const investigated  = enriched.filter((s) => s._label === "INVESTIGATED");
    const unmonitored   = enriched.filter((s) => s._label === "UNMONITORED");
    const prompt =
      `System Status × Investigation Bridge: ${services.length} services, ` +
      `${degraded.length} degraded, ${investigated.length} with open case coverage, ` +
      `${unmonitored.length} unmonitored gaps. ` +
      `Unmonitored degraded: ${unmonitored.slice(0, 4).map((s) => s.name).join(", ") || "none"}. ` +
      `Give a 2-sentence infrastructure-investigation coverage brief — formal, concise, British tone.`;
    try {
      const base = apiBase();
      const r    = await fetch(`${base}/v1/jarvis/agent/chat`, {
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

  const investigatedCount = enriched.filter((s) => s._label === "INVESTIGATED").length;
  const unmonitoredCount  = enriched.filter((s) => s._label === "UNMONITORED").length;
  const badgeColor        = unmonitoredCount > 0 ? AMB : GRN;

  const visible = enriched.filter((svc) => {
    if (search && !svc.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === "INVESTIGATED") return svc._label === "INVESTIGATED";
    if (tab === "UNMONITORED")  return svc._label === "UNMONITORED";
    if (tab === "HEALTHY")      return svc._label === "HEALTHY";
    return true;
  });

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="System Status × Investigation Bridge"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 582,
          background: "rgba(15,23,42,0.85)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          color: "#e2e8f0",
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "center",
          gap: 5,
          letterSpacing: 1,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: badgeColor,
            boxShadow: unmonitoredCount > 0 ? `0 0 6px ${badgeColor}` : "none",
            display: "inline-block",
          }}
        />
        SSIHB
        {unmonitoredCount > 0 && (
          <span
            style={{
              background: badgeColor,
              color: "#0f172a",
              borderRadius: 9,
              padding: "0 5px",
              fontSize: 10,
              fontWeight: 700,
              marginLeft: 2,
            }}
          >
            {unmonitoredCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 600,
            maxHeight: "80vh",
            overflowY: "auto",
            background: "rgba(10,15,30,0.97)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 14,
            zIndex: 9700,
            color: "#e2e8f0",
            fontFamily: "monospace",
            backdropFilter: "blur(20px)",
            boxShadow: "0 0 60px rgba(0,0,0,0.7)",
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
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: 1, color: CY }}>
              ◈ SYSTEM STATUS × INVESTIGATION BRIDGE
            </span>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={assess}
                disabled={assessing}
                style={{
                  background: `rgba(41,231,255,0.15)`,
                  border: `1px solid rgba(41,231,255,0.35)`,
                  borderRadius: 6,
                  color: CY,
                  padding: "3px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {assessing ? "…" : "▶ ASSESS"}
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
              { label: "SERVICES",     val: services.length,    color: "#60a5fa" },
              { label: "CASES",        val: invs.length,        color: "#94a3b8" },
              { label: "INVESTIGATED", val: investigatedCount,  color: GRN },
              { label: "UNMONITORED",  val: unmonitoredCount,   color: unmonitoredCount > 0 ? AMB : "#64748b" },
            ].map(({ label, val, color }) => (
              <div key={label} style={TILE}>
                <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Assessment */}
          {assessment && (
            <div
              style={{
                margin: "0 16px 10px",
                padding: "10px 12px",
                background: `rgba(41,231,255,0.08)`,
                border: `1px solid rgba(41,231,255,0.2)`,
                borderRadius: 8,
                fontSize: 12,
                color: "#67e8f9",
                lineHeight: 1.5,
              }}
            >
              {assessment}
            </div>
          )}

          {/* Filter tabs + search */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 16px 8px",
              flexWrap: "wrap",
            }}
          >
            {["ALL", "INVESTIGATED", "UNMONITORED", "HEALTHY"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? "rgba(41,231,255,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${tab === t ? "rgba(41,231,255,0.5)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 6,
                  color: tab === t ? CY : "#94a3b8",
                  padding: "3px 10px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontWeight: tab === t ? 700 : 400,
                }}
              >
                {t}
              </button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search services…"
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                color: "#e2e8f0",
                padding: "3px 8px",
                fontSize: 11,
                outline: "none",
                minWidth: 80,
              }}
            />
          </div>

          {loading && (
            <div style={{ padding: "8px 18px", color: "#64748b", fontSize: 12 }}>Loading…</div>
          )}
          {err && (
            <div style={{ padding: "8px 18px", color: RED, fontSize: 12 }}>Error: {err}</div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ padding: "16px 18px", color: "#64748b", fontSize: 12 }}>
              No services match the current filter.
            </div>
          )}

          {/* Service rows */}
          <div>
            {visible.map((svc) => {
              const isExp = expanded === svc.id;
              const sc    = stateColor(svc._state);
              const lc    =
                svc._label === "INVESTIGATED" ? GRN
                  : svc._label === "UNMONITORED" ? AMB
                  : "#64748b";
              return (
                <div
                  key={svc.id}
                  style={{ ...ROW, background: isExp ? "rgba(255,255,255,0.04)" : "transparent" }}
                  onClick={() => setExpanded(isExp ? null : svc.id)}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        ...PILL,
                        background: `${lc}18`,
                        color: lc,
                        border: `1px solid ${lc}44`,
                      }}
                    >
                      {svc._label}
                    </span>
                    <span
                      style={{
                        ...PILL,
                        background: `${sc}18`,
                        color: sc,
                        border: `1px solid ${sc}44`,
                      }}
                    >
                      {svc._state.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        color: "#e2e8f0",
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {svc.name}
                    </span>
                    <span style={{ color: "#475569", fontSize: 11 }}>
                      {svc.value}
                    </span>
                    <span style={{ color: "#475569", fontSize: 10 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 8,
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {svc._matches.length > 0 ? (
                        <div>
                          <div
                            style={{ color: "#64748b", fontSize: 11, marginBottom: 6 }}
                          >
                            Matched investigations:
                          </div>
                          {svc._matches.map(({ inv, score }, j) => {
                            const title =
                              inv.title || inv.name || inv.id || `case-${j}`;
                            const status = inv.status || inv.state || "";
                            return (
                              <div key={j} style={{ marginBottom: 6 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 8,
                                    marginBottom: 3,
                                  }}
                                >
                                  {status && (
                                    <span
                                      style={{
                                        ...PILL,
                                        background: "rgba(96,165,250,0.12)",
                                        color: "#60a5fa",
                                        border: "1px solid rgba(96,165,250,0.3)",
                                      }}
                                    >
                                      {status}
                                    </span>
                                  )}
                                  <span
                                    style={{
                                      fontSize: 11,
                                      color: "#e2e8f0",
                                      flex: 1,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {title}
                                  </span>
                                  <span style={{ color: "#888", fontSize: 10 }}>
                                    {Math.round(score * 100)}%
                                  </span>
                                </div>
                                <div
                                  style={{
                                    height: 3,
                                    background: "rgba(255,255,255,0.08)",
                                    borderRadius: 2,
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${Math.round(score * 100)}%`,
                                      height: "100%",
                                      background: GRN,
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : svc._state !== "healthy" ? (
                        <div style={{ color: "#64748b", fontSize: 11 }}>
                          No investigation matched — this degraded service has no open case.
                        </div>
                      ) : (
                        <div style={{ color: "#64748b", fontSize: 11 }}>
                          Service is healthy — no investigation required.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
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
              {visible.length} of {enriched.length} services · {invs.length} investigations
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
