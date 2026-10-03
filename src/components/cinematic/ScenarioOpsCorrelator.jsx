/**
 * F66 — Scenario × Ops Events Correlator (SOEC)
 *
 * Answers: "Which JARVIS scenarios have matching operational activity right now?"
 *
 * Data sources (confirmed real endpoints):
 *   GET /v1/scenario/list  → registered JARVIS scenarios
 *   GET /v1/ops/events     → live operational event stream
 *
 * Each scenario's name/description/tags are keyword-matched against each ops
 * event's event_type/resource/description/details to produce:
 *   TRIGGERED — at least one ops event shares tokens with this scenario
 *   DORMANT   — no matching operational activity found
 *
 * Stat tiles:  scenarios / ops events / triggered / dormant
 * Amber badge: triggered count on button.
 * Expand row:  matched ops events with severity badge + relevance score bar.
 * ▶ ASSESS:   2-sentence AI brief via /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ SOEC  at left:1500 bottom:18, zIndex:68.
 * Event:   jarvis:soec-toggle
 * Voice:   "scenario ops / ops scenario / soec / triggered scenarios /
 *           scenario activity / ops correlation / scenario correlation /
 *           which scenarios are active"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#00c878";
const RED   = "#FF3B6B";
const MUTED = "#6E8AA0";
const BG    = "rgba(4,7,14,0.96)";
const MONO  = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const BTN_LEFT   = 1500;
const REFRESH_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── normalise ───────────────────────────────────────────────────────────────

function normArr(raw) {
  if (Array.isArray(raw))                return raw;
  if (raw && Array.isArray(raw.items))   return raw.items;
  if (raw && Array.isArray(raw.data))    return raw.data;
  if (raw && Array.isArray(raw.results)) return raw.results;
  if (raw && typeof raw === "object")    return Object.values(raw);
  return [];
}

function normScenarios(raw) {
  return normArr(raw).map((r, i) => ({
    id:          String(r.id ?? r.scenario_id ?? i),
    name:        r.name ?? r.title ?? r.label ?? `Scenario ${i + 1}`,
    description: r.description ?? r.summary ?? r.objective ?? "",
    tags:        Array.isArray(r.tags) ? r.tags.join(" ") : (r.tags ?? ""),
    status:      r.status ?? r.state ?? "unknown",
  }));
}

function normEvents(raw) {
  return normArr(raw).map((r, i) => ({
    id:          String(r.id ?? r.event_id ?? i),
    type:        r.event_type ?? r.type ?? r.category ?? "EVENT",
    resource:    r.resource ?? r.entity ?? r.target ?? "",
    description: r.description ?? r.message ?? r.summary ?? "",
    severity:    (r.severity ?? r.level ?? r.priority ?? "INFO").toUpperCase(),
    timestamp:   r.timestamp ?? r.created_at ?? r.ts ?? null,
  }));
}

// ─── correlation ─────────────────────────────────────────────────────────────

function tokenise(text) {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function relevance(scenario, event) {
  const needle = new Set([
    ...tokenise(scenario.name),
    ...tokenise(scenario.description),
    ...tokenise(scenario.tags),
  ]);
  const hay = [
    ...tokenise(event.type),
    ...tokenise(event.resource),
    ...tokenise(event.description),
  ];
  let hits = 0;
  for (const t of hay) if (needle.has(t)) hits++;
  return hits;
}

function correlate(scenarios, events) {
  return scenarios.map(scenario => {
    const matches = events
      .map(ev => ({ ...ev, score: relevance(scenario, ev) }))
      .filter(ev => ev.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
    return {
      ...scenario,
      matches,
      status2: matches.length > 0 ? "TRIGGERED" : "DORMANT",
    };
  });
}

// ─── fetch ───────────────────────────────────────────────────────────────────

async function fetchAll() {
  const hdr  = { Authorization: `Bearer ${API_KEY}` };
  const base = apiBase();
  const [sRes, eRes] = await Promise.all([
    fetch(`${base}/v1/scenario/list`, { headers: hdr }),
    fetch(`${base}/v1/ops/events`,    { headers: hdr }),
  ]);
  const scenarios = normScenarios(await sRes.json());
  const events    = normEvents(await eRes.json());
  return { scenarios, events, correlated: correlate(scenarios, events) };
}

// ─── exported intent helpers (JarvisBrain) ───────────────────────────────────

export function isSoecQuery(q) {
  return /scenario.?ops|ops.?scenario|soec|triggered.?scenario|scenario.?activit|ops.?correlat|scenario.?correlat|which.?scenario.?are.?active/i.test(q);
}

export async function buildSoecScript() {
  try {
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const base = apiBase();
    const { correlated, events } = await fetchAll();
    const triggered = correlated.filter(s => s.status2 === "TRIGGERED");
    const dormant   = correlated.filter(s => s.status2 === "DORMANT");
    const topNames  = triggered.slice(0, 3).map(s => s.name).join(", ");

    const msg = `JARVIS, assess current scenario-to-ops correlation. Out of ${correlated.length} registered scenarios, ${triggered.length} are TRIGGERED (matching live ops events) and ${dormant.length} are DORMANT. There are ${events.length} total ops events in the stream. Top triggered scenarios: ${topNames || "none"}. Give a 2-sentence operational readiness assessment.`;
    const res = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { ...hdr, "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const j = await res.json();
    return j.response ?? j.message ?? j.text ?? j.content ?? `${triggered.length} of ${correlated.length} scenarios triggered by live ops activity.`;
  } catch {
    return "Unable to assess scenario-ops correlation — backend unavailable.";
  }
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: 64 }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? CY, letterSpacing: 1 }}>{value}</div>
      <div style={{ fontSize: 9, color: MUTED, letterSpacing: 1.5, textTransform: "uppercase" }}>{label}</div>
    </div>
  );
}

// ─── SeverityBadge ────────────────────────────────────────────────────────────

function SevBadge({ sev }) {
  const c = sev === "CRITICAL" ? RED : sev === "HIGH" ? AMBER : sev === "WARNING" ? AMBER : CY;
  return (
    <span style={{
      fontSize: 9, padding: "1px 5px", borderRadius: 3,
      background: `${c}22`, border: `1px solid ${c}66`, color: c,
      letterSpacing: 1, textTransform: "uppercase",
    }}>
      {sev}
    </span>
  );
}

// ─── ScenarioRow ──────────────────────────────────────────────────────────────

function ScenarioRow({ row }) {
  const [exp, setExp] = useState(false);
  const isTriggered   = row.status2 === "TRIGGERED";
  const accent        = isTriggered ? AMBER : MUTED;

  return (
    <div style={{
      borderBottom: `1px solid rgba(255,255,255,0.05)`,
      paddingBottom: 6, marginBottom: 6,
    }}>
      <div
        style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
        onClick={() => setExp(v => !v)}
      >
        <span style={{ fontSize: 10, color: MUTED }}>{exp ? "▾" : "▸"}</span>
        <span style={{ fontSize: 11, color: isTriggered ? CY : MUTED, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {row.name}
        </span>
        <span style={{
          fontSize: 9, padding: "1px 6px", borderRadius: 3,
          background: `${accent}22`, border: `1px solid ${accent}55`, color: accent,
          letterSpacing: 1,
        }}>
          {row.status2}
        </span>
        {isTriggered && (
          <span style={{ fontSize: 9, color: AMBER }}>{row.matches.length} ev</span>
        )}
      </div>

      {exp && (
        <div style={{ marginTop: 6, paddingLeft: 16 }}>
          {row.description && (
            <div style={{ fontSize: 10, color: MUTED, marginBottom: 6, lineHeight: 1.5 }}>
              {row.description.slice(0, 120)}{row.description.length > 120 ? "…" : ""}
            </div>
          )}
          {row.matches.length === 0 ? (
            <div style={{ fontSize: 10, color: MUTED, fontStyle: "italic" }}>No matching ops events.</div>
          ) : (
            row.matches.map(ev => (
              <div key={ev.id} style={{ marginBottom: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <SevBadge sev={ev.severity} />
                  <span style={{ fontSize: 10, color: CY, flex: 1 }}>{ev.type}</span>
                  <span style={{ fontSize: 9, color: MUTED }}>score:{ev.score}</span>
                </div>
                <div style={{ fontSize: 9, color: MUTED, marginBottom: 3 }}>
                  {ev.resource && <span style={{ color: "#7EB8D4" }}>[{ev.resource}] </span>}
                  {(ev.description ?? "").slice(0, 80)}{(ev.description ?? "").length > 80 ? "…" : ""}
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, ev.score * 15)}%`,
                    background: AMBER, borderRadius: 2,
                  }} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TRIGGERED", "DORMANT"];

export default function ScenarioOpsCorrelator() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchAll();
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e.message ?? "Fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen(v => !v);
    window.addEventListener("jarvis:soec-toggle", handler);
    return () => window.removeEventListener("jarvis:soec-toggle", handler);
  }, []);

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    try {
      const script = await buildSoecScript();
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } finally {
      setAssessing(false);
    }
  }, [assessing]);

  const rows      = data?.correlated ?? [];
  const events    = data?.events ?? [];
  const triggered = rows.filter(r => r.status2 === "TRIGGERED").length;
  const dormant   = rows.filter(r => r.status2 === "DORMANT").length;

  const visible = rows
    .filter(r => tab === "ALL" || r.status2 === tab)
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q);
    });

  const btnStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 18, zIndex: 68,
    background: "rgba(8,14,22,0.85)", border: `1px solid ${AMBER}55`,
    borderRadius: 8, padding: "5px 10px", cursor: "pointer",
    fontFamily: MONO, fontSize: 11, color: AMBER,
    display: "flex", alignItems: "center", gap: 6,
  };

  const panelStyle = {
    position: "fixed", left: BTN_LEFT, bottom: 48, zIndex: 68,
    width: 360, maxHeight: 520, background: BG,
    border: `1px solid ${AMBER}44`, borderRadius: 12,
    padding: 16, fontFamily: MONO, color: "#DCEBF5",
    backdropFilter: "blur(12px)", boxShadow: `0 0 40px ${AMBER}18`,
    display: "flex", flexDirection: "column",
  };

  return (
    <>
      {/* Toggle button */}
      <button style={btnStyle} onClick={() => setOpen(v => !v)} title="Scenario × Ops Events Correlator">
        <span>◈</span>
        <span>SOEC</span>
        {data && triggered > 0 && (
          <span style={{
            background: `${AMBER}22`, border: `1px solid ${AMBER}`,
            borderRadius: 4, padding: "1px 5px", fontSize: 10, color: AMBER,
          }}>
            {triggered}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={panelStyle}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ color: AMBER, fontSize: 12, fontWeight: 700, letterSpacing: 2 }}>
              SCENARIO × OPS CORRELATOR
            </span>
            {loading && <span style={{ fontSize: 9, color: MUTED }}>POLLING…</span>}
            <button
              onClick={assess}
              disabled={assessing || !data}
              style={{
                marginLeft: "auto", background: "transparent",
                border: `1px solid ${CY}55`, borderRadius: 4,
                padding: "2px 8px", color: CY, cursor: "pointer",
                fontSize: 10, fontFamily: MONO, opacity: assessing ? 0.5 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {err && (
            <div style={{ color: RED, fontSize: 11, marginBottom: 8 }}>⚠ {err}</div>
          )}

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Tile label="SCENARIOS" value={rows.length}   color={CY}    />
            <Tile label="OPS EVS"   value={events.length} color={MUTED} />
            <Tile label="TRIGGERED" value={triggered}     color={AMBER} />
            <Tile label="DORMANT"   value={dormant}       color={MUTED} />
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: "4px 0", fontSize: 9, fontFamily: MONO,
                  background: tab === t ? `${AMBER}22` : "transparent",
                  border: `1px solid ${tab === t ? AMBER : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 4, color: tab === t ? AMBER : MUTED, cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search scenarios…"
            style={{
              width: "100%", marginBottom: 10, padding: "5px 8px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 6, color: "#DCEBF5", fontFamily: MONO, fontSize: 11,
              outline: "none", boxSizing: "border-box",
            }}
          />

          {/* Rows */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {!data && !err && (
              <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 20 }}>
                Loading scenario-ops data…
              </div>
            )}
            {data && visible.length === 0 && (
              <div style={{ color: MUTED, fontSize: 11, textAlign: "center", padding: 20 }}>
                No scenarios match current filter.
              </div>
            )}
            {visible.map(row => (
              <ScenarioRow key={row.id} row={row} />
            ))}
          </div>

          {/* Footer */}
          {data && (
            <div style={{
              marginTop: 8, borderTop: `1px solid rgba(255,255,255,0.07)`,
              paddingTop: 8, fontSize: 9, color: MUTED, textAlign: "center",
            }}>
              {triggered} of {rows.length} scenarios triggered · {events.length} ops events · 60 s refresh
            </div>
          )}
        </div>
      )}
    </>
  );
}
