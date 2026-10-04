/**
 * ScenarioOpsEventNexus — F498
 * "JARVIS, scenario ops / ops scenario / scnops / scenario events /
 *  triggered scenarios / which scenarios have events / scenario event match /
 *  ops triggered / scenario operation"
 * Cross-references /v1/scenario/list + /v1/ops/events.
 * Keyword-matches scenario names/objectives against ops event types/details.
 * TRIGGERED (≥1 matching event) vs UNTRIGGERED (no operational backing).
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFD700";
const RED = "#FF4466";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 24680;

const SCNOPS_RE =
  /\bscenario.?ops?\b|\bops?.?scenario\b|\bscnops\b|\bscenario.?event\b|\bevent.?scenario\b|\btriggered.?scenario\b|\bscenario.?trigger\b|\bwhich.?scenario.?have.?event\b|\bscenario.?operation\b|\bops?.?trigger\b/i;

export function isScnopsQuery(text) {
  return SCNOPS_RE.test(text || "");
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw =
    data.scenarios || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `scn-${i}`,
    name:        (s.name || s.title || s.label || `Scenario ${i + 1}`).trim(),
    status:      (s.status || "UNKNOWN").toUpperCase(),
    kind:        s.kind || s.type || s.category || null,
    objective:   s.objective || s.description || s.summary || null,
    tags: [
      ...(s.tags || []),
      s.kind, s.type, s.category, s.domain,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseEvents(data) {
  if (!data) return [];
  const raw =
    data.events || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((e, i) => ({
    id:       e.id || `ev-${i}`,
    name:     (e.title || e.name || e.event_type || e.type || `Event ${i + 1}`).trim(),
    severity: (e.severity || e.level || "INFO").toUpperCase(),
    detail:   e.detail || e.description || e.summary || e.message || null,
    source:   e.source || e.service || null,
    ts:       e.timestamp || e.created_at || null,
    tags: [
      ...(e.tags || []),
      e.source, e.type, e.event_type, e.category,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function tokenise(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2);
}

function buildNexus(scenarios, events) {
  return scenarios.map(scn => {
    const scnTokens = [
      ...tokenise(scn.name),
      ...tokenise(scn.objective),
      ...scn.tags,
    ];
    const matched = events.filter(ev => {
      const evTokens = [
        ...tokenise(ev.name),
        ...tokenise(ev.detail),
        ...ev.tags,
      ];
      return evTokens.some(t => scnTokens.includes(t)) ||
             scnTokens.some(t => evTokens.includes(t));
    });
    return { scenario: scn, events: matched, triggered: matched.length > 0 };
  });
}

export async function buildScnopsScript() {
  let scnData = null, evData = null;
  try {
    const [sr, er] = await Promise.all([
      fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/ops/events`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (sr.ok) scnData = await sr.json();
    if (er.ok) evData  = await er.json();
  } catch (_) {}

  if (!scnData && !evData)
    return "Unable to retrieve scenario ops event data at this time, sir.";

  const scenarios = normaliseScenarios(scnData);
  const events    = normaliseEvents(evData);
  const nexus     = buildNexus(scenarios, events);
  const triggered   = nexus.filter(r => r.triggered);
  const untriggered = nexus.filter(r => !r.triggered);
  const pct = nexus.length ? Math.round((triggered.length / nexus.length) * 100) : 0;

  if (!nexus.length)
    return `Scenario Ops Event Nexus: ${scenarios.length} scenarios and ${events.length} events scanned. No cross-reference data available, sir.`;

  const top = triggered.slice(0, 2)
    .map(r => `${r.scenario.name} (${r.events.length} event${r.events.length !== 1 ? "s" : ""})`)
    .join("; ");

  return [
    `Scenario Ops Event Nexus: ${triggered.length} of ${nexus.length} scenarios are backed by active operational events (${pct}%).`,
    untriggered.length
      ? `${untriggered.length} scenario${untriggered.length !== 1 ? "s are" : " is"} untriggered — no matching ops events detected.`
      : "All scenarios have corresponding operational events.",
    top ? `Triggered examples: ${top}.` : null,
  ].filter(Boolean).join(" ");
}

function severityColor(sev) {
  return { CRITICAL: RED, HIGH: AMB, WARNING: AMB, MEDIUM: "#FF9944", INFO: CY, LOW: DIM }[sev] || DIM;
}

function scenarioStatusColor(status) {
  return { RUNNING: GRN, ACTIVE: GRN, COMPLETE: CY, COMPLETED: CY, FAILED: RED, PENDING: AMB, QUEUED: AMB }[status] || DIM;
}

const TABS = ["ALL", "TRIGGERED", "UNTRIGGERED"];

export default function ScenarioOpsEventNexus() {
  const [open,      setOpen]      = useState(false);
  const [nexus,     setNexus]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [lastTs,    setLastTs]    = useState(null);
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sr, er] = await Promise.all([
        fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/ops/events`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const scnData = sr.ok ? await sr.json() : null;
      const evData  = er.ok ? await er.json() : null;
      const scenarios = normaliseScenarios(scnData);
      const events    = normaliseEvents(evData);
      setNexus(buildNexus(scenarios, events));
      setLastTs(new Date().toLocaleTimeString());
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    const onToggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:scnops-toggle", onToggle);
    return () => window.removeEventListener("jarvis:scnops-toggle", onToggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const triggered   = nexus.filter(r => r.triggered);
  const untriggered = nexus.filter(r => !r.triggered);
  const pct = nexus.length ? Math.round((triggered.length / nexus.length) * 100) : 0;

  const visible = nexus
    .filter(r => {
      if (filter === "TRIGGERED")   return r.triggered;
      if (filter === "UNTRIGGERED") return !r.triggered;
      return true;
    })
    .filter(r => !search || r.scenario.name.toLowerCase().includes(search.toLowerCase()));

  const assess = useCallback(async (row) => {
    setAssessing(row.scenario.id);
    try {
      const prompt = `Scenario Ops Event Nexus — scenario "${row.scenario.name}": ${
        row.triggered
          ? `matched by ${row.events.length} operational event(s): ${row.events.map(e => e.name).join(", ")}.`
          : "no matching operational events found."
      } Provide a 2-sentence analysis of the operational implications.`;
      const res = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      if (res.ok) {
        const j = await res.json();
        const text = j.response || j.reply || j.message || j.content || null;
        if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch (_) {}
    setAssessing(null);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   87,
          background: untriggered.length > 0 ? `${AMB}22` : `${CY}18`,
          border:   `1px solid ${untriggered.length > 0 ? AMB : CY}55`,
          color:    untriggered.length > 0 ? AMB : CY,
          padding:  "2px 6px",
          fontSize: 9,
          letterSpacing: 1.2,
          cursor: "pointer",
          borderRadius: 3,
          fontFamily: "monospace",
        }}
      >
        ◈ SCNOPS
        {untriggered.length > 0 && (
          <span style={{
            marginLeft: 4,
            background: AMB,
            color: "#000",
            borderRadius: 3,
            padding: "0 3px",
            fontSize: 8,
          }}>{untriggered.length}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed",
          top:      60,
          right:    8,
          width:    390,
          maxHeight: "80vh",
          background: "rgba(4,14,26,0.97)",
          border: `1px solid ${CY}44`,
          borderRadius: 6,
          zIndex: 9011,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: "monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "8px 12px 6px",
            borderBottom: `1px solid ${CY}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 1.5 }}>
              ◈ SCENARIO OPS EVENT NEXUS
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}
            >✕</button>
          </div>

          {/* Stats */}
          <div style={{
            display: "flex", gap: 8, padding: "6px 12px",
            borderBottom: `1px solid ${CY}18`,
          }}>
            {[
              { label: "SCENARIOS",    val: nexus.length,          col: CY  },
              { label: "TRIGGERED",    val: triggered.length,      col: GRN },
              { label: "UNTRIGGERED",  val: untriggered.length,    col: AMB },
              { label: "COVERAGE",     val: `${pct}%`,             col: CY  },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, textAlign: "center",
                background: `${s.col}0d`, border: `1px solid ${s.col}33`,
                borderRadius: 4, padding: "4px 0",
              }}>
                <div style={{ color: s.col, fontSize: 13, fontWeight: 700 }}>{s.val}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "5px 12px", borderBottom: `1px solid ${CY}18` }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                style={{
                  background: filter === t ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === t ? CY : CY + "33"}`,
                  color: filter === t ? CY : DIM,
                  padding: "2px 6px", fontSize: 8, borderRadius: 3,
                  cursor: "pointer", letterSpacing: 0.8,
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search scenarios…"
              style={{
                flex: 1, background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}33`, borderRadius: 3,
                color: CY, fontSize: 8, padding: "2px 5px",
                outline: "none", fontFamily: "monospace",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && nexus.length === 0 && (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 16 }}>
                Loading scenario ops event nexus…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 9, textAlign: "center", padding: 16 }}>
                No scenarios match current filter.
              </div>
            )}
            {visible.map(row => {
              const isExp    = expanded === row.scenario.id;
              const statusCol = row.triggered ? GRN : AMB;
              const scnCol    = scenarioStatusColor(row.scenario.status);
              return (
                <div
                  key={row.scenario.id}
                  style={{
                    padding: "7px 12px",
                    borderBottom: `1px solid ${CY}11`,
                    borderLeft: `3px solid ${statusCol}`,
                    cursor: "pointer",
                  }}
                  onClick={() => setExpanded(isExp ? null : row.scenario.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{
                      background: `${statusCol}22`,
                      color: statusCol,
                      border: `1px solid ${statusCol}55`,
                      borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                      flexShrink: 0,
                    }}>
                      {row.triggered ? "TRIGGERED" : "UNTRIGGERED"}
                    </span>
                    <span style={{
                      background: `${scnCol}18`, color: scnCol,
                      border: `1px solid ${scnCol}44`,
                      borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                      flexShrink: 0,
                    }}>
                      {row.scenario.status}
                    </span>
                    <span style={{ color: "#c0d8f0", fontSize: 10, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.scenario.name}
                    </span>
                    {row.triggered && (
                      <button
                        onClick={e => { e.stopPropagation(); assess(row); }}
                        style={{
                          background: `${CY}18`, border: `1px solid ${CY}44`,
                          color: CY, padding: "1px 5px", fontSize: 8,
                          borderRadius: 3, cursor: "pointer",
                        }}
                      >
                        {assessing === row.scenario.id ? "…" : "▶ ASSESS"}
                      </button>
                    )}
                    <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {row.scenario.kind && !isExp && (
                    <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                      {row.scenario.kind}
                      {row.events.length > 0 ? ` · ${row.events.length} event${row.events.length !== 1 ? "s" : ""}` : ""}
                    </div>
                  )}

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.scenario.kind && (
                        <div style={{ color: DIM, fontSize: 9 }}>
                          Kind: <span style={{ color: AMB }}>{row.scenario.kind}</span>
                        </div>
                      )}
                      {row.scenario.objective && (
                        <div style={{ color: "#9ab8d0", fontSize: 9, lineHeight: 1.4, marginBottom: 4 }}>
                          {row.scenario.objective.slice(0, 160)}
                          {row.scenario.objective.length > 160 ? "…" : ""}
                        </div>
                      )}
                      {row.events.length === 0 && (
                        <div style={{ color: AMB, fontSize: 9 }}>
                          No operational events match this scenario.
                        </div>
                      )}
                      {row.events.map(ev => {
                        const sCol = severityColor(ev.severity);
                        return (
                          <div key={ev.id} style={{
                            background: "rgba(41,231,255,0.04)",
                            border: `1px solid ${sCol}33`,
                            borderRadius: 4, padding: "5px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{
                                background: `${sCol}22`, color: sCol,
                                border: `1px solid ${sCol}55`,
                                borderRadius: 3, padding: "0 4px", fontSize: 7, letterSpacing: 1,
                              }}>{ev.severity}</span>
                              <span style={{ color: "#c0d8f0", fontSize: 10 }}>{ev.name}</span>
                            </div>
                            {ev.source && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2 }}>
                                Source: <span style={{ color: CY }}>{ev.source}</span>
                              </div>
                            )}
                            {ev.detail && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 2, lineHeight: 1.4 }}>
                                {ev.detail.slice(0, 140)}{ev.detail.length > 140 ? "…" : ""}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "5px 12px",
            borderTop: `1px solid ${CY}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>
              AUTO-REFRESH {POLL_MS / 1000}s · /v1/scenario/list + /v1/ops/events
            </span>
            {lastTs && <span style={{ color: DIM, fontSize: 8 }}>{lastTs}</span>}
          </div>
        </div>
      )}
    </>
  );
}
