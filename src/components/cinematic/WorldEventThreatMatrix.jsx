/**
 * F229 — Live Intel × Scenario × RiskSignal World Event Threat Matrix (WETMAT)
 *
 * Parallel-fetches /functions/getLiveIntel (quakes/crypto/FX),
 * /v1/scenario/list, and /entities/RiskSignal; keyword-correlates each
 * live world event against scenario playbooks AND risk signals to classify:
 *   DUAL_THREAT   — matched by ≥1 risk signal AND ≥1 scenario
 *   RISK_ESCALATION — matched by risk signal only (no scenario cover)
 *   SCENARIO_PLANNED — matched by scenario only (no active risk signal)
 *   BACKGROUND     — no match (informational only)
 *
 * Stat tiles: EVENTS / SCENARIOS / RISK SIGS / DUAL / RISK ONLY / SCEN ONLY / BG
 * Filter tabs: ALL | DUAL_THREAT | RISK_ESCALATION | SCENARIO_PLANNED | BACKGROUND
 * Expand any event → matched scenario cards (cyan) + risk signal cards (red)
 * ▶ ASSESS MATRIX → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle:  ◈ WETMAT  left:1090000, bottom:8, zIndex:250
 * Voice:   "wetmat / world event threat / event threat matrix / scenario risk event /
 *           live event matrix / world threat matrix"
 * Event:   jarvis:wetmat-toggle
 * Refresh: 5-min auto-poll (matches getLiveIntel cadence)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 1090000;
const POLL_MS  = 300_000; // 5 min
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

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

const WETMAT_RE =
  /\b(wetmat|world\s+event\s+threat|event\s+threat\s+matrix|scenario\s+risk\s+event|live\s+event\s+matrix|world\s+threat\s+matrix|threat\s+event\s+coverage)\b/i;

export function isWetmatQuery(q) { return WETMAT_RE.test(q); }

export async function buildWetmatScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [intelRes, scenRes, riskRes] = await Promise.all([
      fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,       { headers: hdr }),
      fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
    ]);
    const intelRaw = await intelRes.json();
    const scenRaw  = await scenRes.json();
    const riskRaw  = await riskRes.json();

    const events    = normaliseEvents(intelRaw);
    const scenarios = normaliseScenarios(scenRaw);
    const risks     = normaliseRisks(riskRaw);
    const correlated = buildCorrelated(events, scenarios, risks);

    const dual  = correlated.filter(e => e.cls === "DUAL_THREAT").length;
    const ronly = correlated.filter(e => e.cls === "RISK_ESCALATION").length;
    const sonly = correlated.filter(e => e.cls === "SCENARIO_PLANNED").length;
    const bg    = correlated.filter(e => e.cls === "BACKGROUND").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS world event threat matrix: ${events.length} live world events cross-referenced ` +
          `against ${scenarios.length} scenario playbooks and ${risks.length} risk signals. ` +
          `Classification: ${dual} DUAL_THREAT (both matched), ${ronly} RISK_ESCALATION (risk only), ` +
          `${sonly} SCENARIO_PLANNED (scenario only), ${bg} BACKGROUND (no match). ` +
          `Give a 2-sentence world-threat matrix brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "World event threat matrix assessment complete, sir.").trim();
  } catch {
    return "World event threat matrix is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const quakes  = (Array.isArray(raw?.earthquakes) ? raw.earthquakes
    : Array.isArray(raw) ? raw : []).slice(0, 40).map((q, i) => ({
    id: `q-${q.id || i}`,
    label: q.place || q.location || q.title || `Quake ${i+1}`,
    type: "QUAKE",
    detail: `M${parseFloat(q.mag||q.magnitude||0).toFixed(1)} ${q.place||""}`,
  }));
  const crypto  = (Array.isArray(raw?.crypto) ? raw.crypto : []).slice(0, 20).map((c, i) => ({
    id: `c-${c.symbol || i}`,
    label: c.symbol || c.name || `Crypto ${i+1}`,
    type: "CRYPTO",
    detail: c.price ? `$${parseFloat(c.price).toFixed(2)}` : "",
  }));
  const fx      = (Array.isArray(raw?.fx) ? raw.fx : []).slice(0, 20).map((f, i) => ({
    id: `f-${f.pair || i}`,
    label: f.pair || f.name || `FX ${i+1}`,
    type: "FX",
    detail: f.rate ? String(parseFloat(f.rate).toFixed(4)) : "",
  }));
  return [...quakes, ...crypto, ...fx];
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.scenarios)        ? raw.scenarios
    : Array.isArray(raw?.data)             ? raw.data
    : [];
  return arr.map((s, i) => ({
    id:   s.id || String(i),
    name: s.name || s.title || s.scenario_name || `Scenario ${i+1}`,
    desc: s.description || s.summary || "",
  }));
}

function normaliseRisks(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.risk_signals)     ? raw.risk_signals
    : [];
  return arr.map((r, i) => ({
    id:       r.id || String(i),
    title:    r.title || r.name || r.signal_name || `Signal ${i+1}`,
    severity: (r.severity || r.level || "").toUpperCase(),
    desc:     r.description || r.summary || "",
  }));
}

function tokens(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(t => t.length > 2);
}

function relevance(evtLabel, targetText) {
  const et = tokens(evtLabel);
  const tt = tokens(targetText);
  return et.filter(t => tt.includes(t)).length;
}

function buildCorrelated(events, scenarios, risks) {
  return events.map(ev => {
    const matchedScenarios = scenarios.filter(s =>
      relevance(ev.label, `${s.name} ${s.desc}`) > 0
    );
    const matchedRisks = risks.filter(r =>
      relevance(ev.label, `${r.title} ${r.desc}`) > 0
    );
    const hasRisk = matchedRisks.length > 0;
    const hasScen = matchedScenarios.length > 0;
    const cls = hasRisk && hasScen ? "DUAL_THREAT"
      : hasRisk ? "RISK_ESCALATION"
      : hasScen ? "SCENARIO_PLANNED"
      : "BACKGROUND";
    return { ...ev, cls, matchedScenarios, matchedRisks };
  });
}

const TABS = ["ALL", "DUAL_THREAT", "RISK_ESCALATION", "SCENARIO_PLANNED", "BACKGROUND"];

const CLS_COLOR = {
  DUAL_THREAT:      "#EF4444",
  RISK_ESCALATION:  "#F97316",
  SCENARIO_PLANNED: "#22D3EE",
  BACKGROUND:       "#6B7280",
};

const CLS_LABEL = {
  DUAL_THREAT:      "DUAL",
  RISK_ESCALATION:  "RISK",
  SCENARIO_PLANNED: "SCEN",
  BACKGROUND:       "BG",
};

const TYPE_COLOR = { QUAKE: "#F87171", CRYPTO: "#FBBF24", FX: "#34D399" };

function sevColor(sev) {
  if (!sev) return "#6B7280";
  if (sev === "CRITICAL") return "#EF4444";
  if (sev === "HIGH")     return "#F97316";
  if (sev === "MEDIUM")   return "#FBBF24";
  return "#22D3EE";
}

// ── component ─────────────────────────────────────────────────────────────────

export default function WorldEventThreatMatrix() {
  const [open,     setOpen]     = useState(false);
  const [events,   setEvents]   = useState([]);
  const [scenarios,setScenarios]= useState([]);
  const [risks,    setRisks]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [filter,   setFilter]   = useState("ALL");
  const [expanded, setExpanded] = useState(null);
  const [assessing,setAssessing]= useState(false);
  const [lastFetch,setLastFetch]= useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [ir, sr, rr] = await Promise.all([
        fetch(`${base}/functions/getLiveIntel`, { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,       { headers: hdr }),
        fetch(`${base}/entities/RiskSignal`,    { headers: hdr }),
      ]);
      const [id, sd, rd] = await Promise.all([ir.json(), sr.json(), rr.json()]);
      setEvents(normaliseEvents(id));
      setScenarios(normaliseScenarios(sd));
      setRisks(normaliseRisks(rd));
      setLastFetch(new Date());
    } catch { /* keep stale data */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [open, load]);

  useEffect(() => {
    const onToggle = () => setOpen(v => !v);
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isWetmatQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:wetmat-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:wetmat-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  const correlated = buildCorrelated(events, scenarios, risks);
  const dual   = correlated.filter(e => e.cls === "DUAL_THREAT").length;
  const ronly  = correlated.filter(e => e.cls === "RISK_ESCALATION").length;
  const sonly  = correlated.filter(e => e.cls === "SCENARIO_PLANNED").length;
  const bg     = correlated.filter(e => e.cls === "BACKGROUND").length;
  const threat = dual + ronly;

  const visible = correlated.filter(e => filter === "ALL" || e.cls === filter);

  async function assess() {
    setAssessing(true);
    const text = await buildWetmatScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        title="World Event Threat Matrix (◈ WETMAT)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 250,
          background: open ? "rgba(239,68,68,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? "#EF4444" : S.border}`,
          borderRadius: S.radius, color: open ? "#EF4444" : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? "0 0 8px #EF444444" : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ WETMAT{threat > 0 && (
          <span style={{
            marginLeft: 4, background: "#EF4444", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{threat}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", zIndex: 249,
          bottom: 36, left: Math.max(8, BTN_LEFT - 320),
          width: 400,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: "2px solid #EF4444",
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "72vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: "#EF4444", letterSpacing: 2, fontWeight: 700 }}>
              WORLD EVENT THREAT MATRIX
            </span>
            <button
              onClick={assess}
              disabled={assessing || events.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || events.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS MATRIX"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 5, padding: "8px 12px",
          }}>
            {[
              { label: "EVENTS",   val: events.length,   color: C.blue    },
              { label: "SCENARIOS",val: scenarios.length, color: "#22D3EE" },
              { label: "RISK SIGS",val: risks.length,    color: "#F97316" },
              { label: "DUAL THR", val: dual,            color: "#EF4444" },
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
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(3,1fr)",
            gap: 5, padding: "0 12px 8px",
          }}>
            {[
              { label: "RISK ONLY", val: ronly, color: "#F97316" },
              { label: "SCEN ONLY", val: sonly, color: "#22D3EE" },
              { label: "BACKGROUND",val: bg,    color: "#6B7280" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.base, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Coverage bar */}
          {events.length > 0 && (
            <div style={{ padding: "0 12px 6px" }}>
              <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.round(((dual + ronly + sonly) / events.length) * 100)}%`,
                  background: "linear-gradient(90deg,#EF4444,#F97316,#22D3EE)",
                  transition: "width 0.5s",
                }} />
              </div>
              <div style={{ color: S.text, fontSize: "8px", textAlign: "right", marginTop: 2 }}>
                {Math.round(((dual + ronly + sonly) / events.length) * 100)}% TRACKED
              </div>
            </div>
          )}

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 3, padding: "0 12px 6px", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: "0 0 auto",
                background: filter === t ? "rgba(239,68,68,0.15)" : "transparent",
                border: `1px solid ${filter === t ? "#EF4444" : S.border}`,
                color: filter === t ? "#EF4444" : S.text,
                borderRadius: S.radius, padding: "2px 5px",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 0.5, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && events.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No events match.</div>
            ) : visible.map(ev => (
              <div key={ev.id} style={{ marginBottom: 5 }}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "5px 7px", borderRadius: 5, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${CLS_COLOR[ev.cls]}`,
                  }}
                >
                  <span style={{
                    fontSize: "8px", padding: "1px 4px", borderRadius: 3,
                    background: `${TYPE_COLOR[ev.type] || "#6B7280"}22`,
                    color: TYPE_COLOR[ev.type] || "#6B7280",
                    border: `1px solid ${TYPE_COLOR[ev.type] || "#6B7280"}44`,
                    whiteSpace: "nowrap",
                  }}>{ev.type}</span>
                  <span style={{
                    flex: 1, color: S.textHi, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px",
                  }}>{ev.label}</span>
                  {ev.detail && (
                    <span style={{ color: S.text, fontSize: "8px", whiteSpace: "nowrap" }}>{ev.detail}</span>
                  )}
                  <span style={{
                    fontSize: "8px", padding: "1px 4px", borderRadius: 3,
                    background: `${CLS_COLOR[ev.cls]}22`, color: CLS_COLOR[ev.cls],
                    border: `1px solid ${CLS_COLOR[ev.cls]}44`, whiteSpace: "nowrap",
                  }}>{CLS_LABEL[ev.cls]}</span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === ev.id ? "▴" : "▾"}</span>
                </div>

                {expanded === ev.id && (
                  <div style={{
                    margin: "2px 0 2px 16px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "6px 8px",
                  }}>
                    {/* Risk signals */}
                    {ev.matchedRisks.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ color: "#F97316", fontSize: "8px", letterSpacing: 1, marginBottom: 3 }}>RISK SIGNALS</div>
                        {ev.matchedRisks.map(r => (
                          <div key={r.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                          }}>
                            <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {r.title}
                            </span>
                            {r.severity && (
                              <span style={{ fontSize: "8px", marginLeft: 6, whiteSpace: "nowrap", color: sevColor(r.severity) }}>
                                {r.severity}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Scenarios */}
                    {ev.matchedScenarios.length > 0 && (
                      <div>
                        <div style={{ color: "#22D3EE", fontSize: "8px", letterSpacing: 1, marginBottom: 3 }}>SCENARIOS</div>
                        {ev.matchedScenarios.map(sc => (
                          <div key={sc.id} style={{
                            padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                            color: S.textHi, fontSize: "9px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>{sc.name}</div>
                        ))}
                      </div>
                    )}
                    {ev.matchedRisks.length === 0 && ev.matchedScenarios.length === 0 && (
                      <div style={{ color: S.text, fontSize: "9px" }}>No coverage — background event.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /functions/getLiveIntel · /v1/scenario/list · /entities/RiskSignal
            {lastFetch ? ` · ${lastFetch.toLocaleTimeString("en-GB")}` : ""}
          </div>
        </div>
      )}
    </>
  );
}
