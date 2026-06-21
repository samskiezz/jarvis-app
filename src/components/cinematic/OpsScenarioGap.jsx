/**
 * F70 — Ops-Scenario Gap Analyzer
 *
 * Parallel-fetches /v1/ops/events + /v1/scenario/list, then keyword-correlates
 * each live ops event against the scenario catalog to surface whether an event
 * has a PLAYBOOK (at least one matching scenario) or is SCENARIO-DARK (no
 * actionable playbook exists for the incident type).
 *
 * Stat tiles: events / scenarios / covered / dark.
 * Filter tabs: ALL | COVERED | DARK.
 * Expand any event → matched scenarios with relevance score + status.
 * ▶ ASSESS: sends a 2-sentence AI operational-readiness brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ OPSCEN  at bottom:8 left:9124, zIndex 69.
 * Voice:   "ops scenario / ops playbook / scenario coverage ops / opscen / playbook gap"
 * Event:   jarvis:opscen-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9124;
const POLL_MS  = 90_000;

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

// ── exported intent helpers ───────────────────────────────────────────────────

const OPSCEN_RE =
  /\b(ops\s+scenario|ops\s+playbook|playbook\s+gap|scenario[\s-]coverage\s+ops|opscen|incident\s+playbook|ops\s+coverage)\b/i;

export function isOpsScenGapQuery(q) { return OPSCEN_RE.test(q); }

export async function buildOpsScenGapScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [evRes, scRes] = await Promise.all([
      fetch(`${base}/v1/ops/events`,      { headers: hdr }),
      fetch(`${base}/v1/scenario/list`,   { headers: hdr }),
    ]);
    const evRaw = await evRes.json();
    const scRaw = await scRes.json();
    const events    = normaliseEvents(evRaw);
    const scenarios = normaliseScenarios(scRaw);

    const covered = events.filter((ev) => scenarios.some((sc) => relevance(ev, sc) > 0)).length;
    const dark    = events.length - covered;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS ops-scenario coverage: ${events.length} live ops events, ` +
          `${scenarios.length} scenarios available, ${covered} events have a matching playbook, ` +
          `${dark} events are scenario-dark with no actionable scenario. ` +
          `Give a 2-sentence operational-readiness brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Ops-scenario analysis complete, sir.").trim();
  } catch {
    return "Ops-scenario analysis unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseEvents(raw) {
  const arr = Array.isArray(raw)          ? raw
    : Array.isArray(raw?.data)            ? raw.data
    : Array.isArray(raw?.events)          ? raw.events
    : Array.isArray(raw?.items)           ? raw.items
    : Array.isArray(raw?.results)         ? raw.results
    : [];
  return arr.map((ev, i) => ({
    id:       ev.id        || String(i),
    title:    ev.title     || ev.name     || ev.event_type || ev.type || `Event ${i + 1}`,
    desc:     (ev.description || ev.message || ev.summary || ev.tags || "").toString(),
    severity: (ev.severity || ev.level || "").toLowerCase(),
    source:   ev.source    || ev.service  || "",
  }));
}

function normaliseScenarios(raw) {
  const arr = Array.isArray(raw)           ? raw
    : Array.isArray(raw?.data)             ? raw.data
    : Array.isArray(raw?.scenarios)        ? raw.scenarios
    : Array.isArray(raw?.items)            ? raw.items
    : Array.isArray(raw?.results)          ? raw.results
    : [];
  return arr.map((sc, i) => ({
    id:     sc.id      || String(i),
    title:  sc.title   || sc.name   || sc.scenario_name || `Scenario ${i + 1}`,
    desc:   (sc.description || sc.summary || sc.tags || "").toString(),
    status: (sc.status || "").toLowerCase(),
  }));
}

function keywords(str) {
  return String(str || "")
    .toLowerCase()
    .split(/[\s_\-.,/|:@]+/)
    .filter((w) => w.length >= 3);
}

function relevance(event, scenario) {
  const ew = keywords(`${event.title} ${event.desc} ${event.source}`);
  const sw = keywords(`${scenario.title} ${scenario.desc}`);
  return ew.filter((w) => sw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildCorrelated(events, scenarios) {
  return events.map((ev) => {
    const matched = scenarios
      .map((sc) => ({ ...sc, score: relevance(ev, sc) }))
      .filter((sc) => sc.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...ev, scenarios: matched, covered: matched.length > 0 };
  });
}

// ── severity colour helper ────────────────────────────────────────────────────

function sevColor(sev) {
  if (sev === "critical") return "#EF4444";
  if (sev === "high")     return "#F97316";
  if (sev === "medium")   return "#F59E0B";
  return C.blue;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "COVERED", "DARK"];

export default function OpsScenarioGap() {
  const [open,      setOpen]      = useState(false);
  const [events,    setEvents]    = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [evRes, scRes] = await Promise.all([
        fetch(`${base}/v1/ops/events`,     { headers: hdr }),
        fetch(`${base}/v1/scenario/list`,  { headers: hdr }),
      ]);
      setEvents(normaliseEvents(await evRes.json()));
      setScenarios(normaliseScenarios(await scRes.json()));
      setLastFetch(new Date());
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
    window.addEventListener("jarvis:opscen-toggle", onToggle);
    return () => window.removeEventListener("jarvis:opscen-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isOpsScenGapQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const correlated = buildCorrelated(events, scenarios);
  const covered    = correlated.filter((ev) => ev.covered).length;
  const dark       = correlated.filter((ev) => !ev.covered).length;

  const visible = correlated.filter((ev) => {
    if (filter === "COVERED") return ev.covered;
    if (filter === "DARK")    return !ev.covered;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildOpsScenGapScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Ops-Scenario Gap Analyzer (◈ OPSCEN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ OPSCEN{dark > 0 && (
          <span style={{
            marginLeft: 4, background: "#EF4444", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{dark}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 260),
          width: 340,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              OPS–SCENARIO GAP
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
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "EVENTS",    val: events.length,    color: C.blue    },
              { label: "SCENARIOS", val: scenarios.length,  color: C.neon    },
              { label: "COVERED",   val: covered,           color: "#4ADE80" },
              { label: "DARK",      val: dark,              color: "#EF4444" },
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
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && events.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No events match.</div>
            ) : visible.map((ev) => (
              <div key={ev.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${ev.covered ? "#4ADE80" : "#EF4444"}`,
                  }}
                >
                  <span style={{ color: ev.covered ? "#4ADE80" : "#EF4444", fontSize: 10, width: 10 }}>
                    {ev.covered ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.title}
                  </span>
                  {ev.severity && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${sevColor(ev.severity)}22`, color: sevColor(ev.severity),
                      border: `1px solid ${sevColor(ev.severity)}44`,
                    }}>
                      {ev.severity}
                    </span>
                  )}
                  <span style={{ color: ev.covered ? "#4ADE80" : "#EF4444", fontSize: "9px", minWidth: 46, textAlign: "right" }}>
                    {ev.covered ? `${ev.scenarios.length} SC` : "DARK"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === ev.id ? "▴" : "▾"}</span>
                </div>

                {expanded === ev.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {ev.covered ? ev.scenarios.map((sc) => (
                      <div key={sc.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sc.title}
                        </span>
                        <span style={{ fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap", color: S.text }}>
                          rel:{sc.score}{sc.status ? ` · ${sc.status}` : ""}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No matching scenarios for this ops event.
                      </div>
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
            /v1/ops/events · /v1/scenario/list · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
