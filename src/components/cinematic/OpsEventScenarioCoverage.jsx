/**
 * OpsEventScenarioCoverage — F613
 * "JARVIS, ops event scenario / ops scenario coverage / oescn / event scenario /
 *  unplanned events / scenario ops / event simulation / ops event sim"
 * Cross-references /v1/ops/events + /v1/scenario/list.
 * Keyword-matches ops events against active scenarios by name/description/tags.
 * KIND-badged; BACKED vs UNPLANNED; click to expand matched scenarios;
 * ▶ ASSESS → /v1/jarvis/agent/chat + TTS; amber badge on unplanned count.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const ORG = "#FF8C42";
const PRP = "#A855F7";
const GRN = "#00E5A0";
const DIM = "#8899AA";
const AMB = "#FFD700";
const RED = "#FF4444";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 90_000;
const BTN_LEFT = 92_480;

const OESCN_RE =
  /\bops.?event.?scenario\b|\bops.?scenario.?coverage\b|\boescn\b|\bevent.?scenario\b|\bunplanned.?events\b|\bscenario.?ops\b|\bevent.?simulation\b|\bops.?event.?sim\b|\bops.?scenario\b|\bscenario.?coverage.?ops\b/i;

export function isOescnQuery(text) {
  return OESCN_RE.test(text || "");
}

const KIND_COLOR = {
  THREAT: ORG, RISK: ORG, FINANCIAL: GRN,
  INTEL: CY, OPERATIONS: PRP, SCENARIO: AMB,
};
function kindColor(kind) {
  const k = (kind || "").toUpperCase();
  return KIND_COLOR[k] || AMB;
}

function normaliseEvents(data) {
  if (!data) return [];
  const raw = data.events || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((e, i) => ({
    id:       e.id || `ev-${i}`,
    title:    (e.title || e.name || e.event_type || e.type || `Event ${i + 1}`).trim(),
    severity: (e.severity || e.level || "").toUpperCase(),
    message:  e.message || e.description || e.detail || null,
    tags: [
      ...(e.tags || []),
      ...(e.labels || []),
      e.source, e.service, e.component, e.category,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function normaliseScenarios(data) {
  if (!data) return [];
  const raw = data.scenarios || data.items || data.results || (Array.isArray(data) ? data : []);
  return raw.map((s, i) => ({
    id:          s.id || `sc-${i}`,
    name:        s.name || s.title || s.scenario_name || `Scenario ${i + 1}`,
    kind:        (s.kind || s.type || s.category || "").toUpperCase(),
    description: s.description || s.summary || s.detail || null,
    tags: [
      ...(s.tags || []),
      ...(s.labels || []),
      s.target, s.entity, s.related_entity,
    ].filter(Boolean).map(t => String(t).toLowerCase()),
  }));
}

function buildNexus(events, scenarios) {
  return events.map(ev => {
    const eTitle = ev.title.toLowerCase();
    const eMsg   = (ev.message || "").toLowerCase();
    const matched = scenarios.filter(sc => {
      const sName = sc.name.toLowerCase();
      const sDesc = (sc.description || "").toLowerCase();
      const nameHit = sName.includes(eTitle) || eTitle.includes(sName) ||
                      sDesc.includes(eTitle) || eMsg.includes(sName);
      const tagHit  = ev.tags.some(et =>
        sc.tags.some(st => st && et && (st.includes(et) || et.includes(st)))
      );
      return nameHit || tagHit;
    });
    return { event: ev, scenarios: matched };
  });
}

export async function buildOescnScript() {
  let eventsData = null, scenarioData = null;
  try {
    const [er, sr] = await Promise.all([
      fetch(`${apiBase()}/v1/ops/events`,      { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/scenario/list`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    if (er.ok) eventsData   = await er.json();
    if (sr.ok) scenarioData = await sr.json();
  } catch (_) {}

  if (!eventsData && !scenarioData)
    return "Unable to retrieve ops-event scenario coverage data at this time, sir.";

  const events    = normaliseEvents(eventsData);
  const scenarios = normaliseScenarios(scenarioData);
  const nexus     = buildNexus(events, scenarios);
  const backed    = nexus.filter(r => r.scenarios.length > 0);
  const unplanned = nexus.filter(r => r.scenarios.length === 0);
  const coverage  = events.length > 0
    ? Math.round((backed.length / events.length) * 100) : 0;

  const topUnplanned = unplanned.slice(0, 3).map(r => r.event.title).join(", ") || "none";

  const prompt = `You are JARVIS. Ops Event × Scenario Coverage analysis:
  Total ops events: ${events.length}
  Scenario-backed: ${backed.length}
  Unplanned events: ${unplanned.length}
  Coverage: ${coverage}%
  Top unplanned events: ${topUnplanned}

  Provide a 2-sentence operational readiness assessment. Be direct and technical.`;

  let commentary = "";
  try {
    const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: prompt }),
    });
    if (resp.ok) {
      const d = await resp.json();
      commentary = d.response || d.message || d.text || "";
    }
  } catch (_) {}

  const spoken = commentary ||
    `${coverage}% of ${events.length} operational events have scenario coverage. ` +
    (unplanned.length > 0
      ? `${unplanned.length} events remain unplanned, including ${topUnplanned}.`
      : "All active events have scenario backing, sir.");

  window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: spoken } }));
  window.dispatchEvent(new CustomEvent("jarvis:oescn-toggle"));
  return spoken;
}

const SEV_COLOR = { CRITICAL: RED, HIGH: ORG, WARNING: AMB, INFO: CY, LOW: DIM };
function sevColor(sev) { return SEV_COLOR[(sev || "").toUpperCase()] || DIM; }

export default function OpsEventScenarioCoverage() {
  const [open, setOpen]       = useState(false);
  const [events, setEvents]   = useState([]);
  const [scenarios, setScn]   = useState([]);
  const [nexus, setNexus]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [badge, setBadge]     = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [er, sr] = await Promise.all([
        fetch(`${apiBase()}/v1/ops/events`,    { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${apiBase()}/v1/scenario/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const evData  = er.ok  ? await er.json()  : null;
      const scnData = sr.ok  ? await sr.json()  : null;
      const evs  = normaliseEvents(evData);
      const scns = normaliseScenarios(scnData);
      const nex  = buildNexus(evs, scns);
      setEvents(evs);
      setScn(scns);
      setNexus(nex);
      setBadge(nex.filter(r => r.scenarios.length === 0).length);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    const h = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:oescn-toggle", h);
    return () => window.removeEventListener("jarvis:oescn-toggle", h);
  }, []);

  const assess = useCallback(async (row) => {
    setAssessing(row.event.id);
    const prompt = `You are JARVIS. Ops event "${row.event.title}" has ${row.scenarios.length} scenario matches: ${row.scenarios.map(s => s.name).join(", ") || "none"}. Assess operational risk and readiness in 2 sentences.`;
    try {
      const resp = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      if (resp.ok) {
        const d = await resp.json();
        const text = d.response || d.message || d.text || "";
        if (text) window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch (_) {}
    setAssessing(null);
  }, []);

  const backed    = nexus.filter(r => r.scenarios.length > 0);
  const unplanned = nexus.filter(r => r.scenarios.length === 0);
  const coverage  = nexus.length > 0
    ? Math.round((backed.length / nexus.length) * 100) : 0;

  const tabs = ["ALL", "BACKED", "UNPLANNED"];

  const visible = nexus
    .filter(row => {
      if (filter === "BACKED")    return row.scenarios.length > 0;
      if (filter === "UNPLANNED") return row.scenarios.length === 0;
      return true;
    })
    .filter(row => {
      const q = search.toLowerCase();
      return !q || row.event.title.toLowerCase().includes(q);
    });

  const kinds = [...new Set(nexus.flatMap(r => r.scenarios.map(s => s.kind)).filter(Boolean))];

  return (
    <>
      {/* Dock button */}
      <button
        onClick={() => { setOpen(v => !v); if (!open) load(); }}
        title="Ops Event × Scenario Coverage (OESCN)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 166,
          background: open ? CY : "rgba(41,231,255,0.12)",
          color: open ? "#000" : CY,
          border: `1px solid ${CY}66`, borderRadius: 4,
          padding: "2px 7px", fontSize: 9, fontFamily: "monospace",
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
        }}
      >
        {badge > 0 && (
          <span style={{
            background: AMB, color: "#000", borderRadius: "50%",
            padding: "0 4px", fontSize: 8, marginRight: 4, fontWeight: "bold",
          }}>{badge > 99 ? "99+" : badge}</span>
        )}
        ◈ OESCN
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 38, left: BTN_LEFT - 340, zIndex: 166,
          width: 420, maxHeight: 540,
          background: "rgba(4,12,24,0.97)",
          border: `1px solid ${CY}44`, borderRadius: 8,
          fontFamily: "monospace", display: "flex", flexDirection: "column",
          boxShadow: `0 0 24px ${CY}22`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
          }}>
            <div style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>
              OPS EVENT × SCENARIO COVERAGE
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{
                background: `${coverage >= 80 ? GRN : coverage >= 50 ? AMB : RED}22`,
                color: coverage >= 80 ? GRN : coverage >= 50 ? AMB : RED,
                border: `1px solid ${coverage >= 80 ? GRN : coverage >= 50 ? AMB : RED}55`,
                borderRadius: 3, padding: "1px 6px", fontSize: 9, letterSpacing: 1,
              }}>{coverage}% COVERED</span>
              <button
                onClick={load}
                style={{ background: "none", border: `1px solid ${CY}44`, color: CY,
                         borderRadius: 3, padding: "1px 6px", fontSize: 9, cursor: "pointer" }}
              >↺</button>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM,
                         fontSize: 13, cursor: "pointer", lineHeight: 1 }}
              >✕</button>
            </div>
          </div>

          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 16, padding: "6px 12px",
            borderBottom: `1px solid ${CY}22`,
          }}>
            {[
              ["EVENTS",    nexus.length,    CY],
              ["BACKED",    backed.length,   GRN],
              ["UNPLANNED", unplanned.length, AMB],
              ["SCENARIOS", scenarios.length, PRP],
            ].map(([label, val, col]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
                <div style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Search + filter tabs */}
          <div style={{ padding: "6px 12px", borderBottom: `1px solid ${CY}22` }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ops events…"
              style={{
                width: "100%", boxSizing: "border-box",
                background: "rgba(41,231,255,0.06)", border: `1px solid ${CY}44`,
                borderRadius: 4, padding: "4px 8px", color: "#d0e8ff", fontSize: 10,
                fontFamily: "monospace", outline: "none", marginBottom: 6,
              }}
            />
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {tabs.map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  style={{
                    background: filter === t ? CY : "rgba(41,231,255,0.08)",
                    color: filter === t ? "#000" : CY,
                    border: `1px solid ${CY}55`, borderRadius: 3,
                    padding: "1px 6px", fontSize: 8, cursor: "pointer", letterSpacing: 1,
                  }}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && nexus.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, padding: 16, textAlign: "center" }}>
                Loading…
              </div>
            )}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, padding: 16, textAlign: "center" }}>
                No ops events found.
              </div>
            )}
            {visible.map(row => {
              const isExp   = expanded === row.event.id;
              const isCover = row.scenarios.length > 0;
              const sCol    = sevColor(row.event.severity);
              return (
                <div
                  key={row.event.id}
                  style={{ borderBottom: `1px solid ${CY}18`, padding: "8px 12px", cursor: "pointer" }}
                  onClick={() => setExpanded(isExp ? null : row.event.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span style={{
                        background: (isCover ? GRN : AMB) + "22",
                        color: isCover ? GRN : AMB,
                        border: `1px solid ${isCover ? GRN : AMB}55`,
                        borderRadius: 3, padding: "1px 5px", fontSize: 7,
                        letterSpacing: 1, whiteSpace: "nowrap", flexShrink: 0,
                      }}>{isCover ? `${row.scenarios.length} SCN` : "UNPLANNED"}</span>
                      {row.event.severity && (
                        <span style={{
                          background: sCol + "22", color: sCol,
                          border: `1px solid ${sCol}55`,
                          borderRadius: 3, padding: "1px 4px",
                          fontSize: 7, letterSpacing: 1, flexShrink: 0,
                        }}>{row.event.severity}</span>
                      )}
                      <span style={{
                        color: "#e0f0ff", fontSize: 10,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{row.event.title}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); assess(row); }}
                        disabled={assessing === row.event.id}
                        style={{
                          background: "none", border: `1px solid ${CY}55`, color: CY,
                          borderRadius: 3, padding: "1px 5px", fontSize: 8, cursor: "pointer",
                          opacity: assessing === row.event.id ? 0.5 : 1,
                        }}
                      >{assessing === row.event.id ? "…" : "▶ ASSESS"}</button>
                      <span style={{ color: DIM, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                    </div>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 6, paddingLeft: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                      {row.event.message && (
                        <div style={{
                          color: DIM, fontSize: 9, marginBottom: 4, lineHeight: 1.4,
                          background: "rgba(41,231,255,0.04)", borderRadius: 3, padding: "4px 6px",
                        }}>
                          {row.event.message.slice(0, 200)}
                          {row.event.message.length > 200 ? "…" : ""}
                        </div>
                      )}
                      {row.scenarios.length === 0 && (
                        <div style={{ color: AMB, fontSize: 9, fontStyle: "italic" }}>
                          No scenario backing — add a scenario to cover this event.
                        </div>
                      )}
                      {row.scenarios.map(sc => {
                        const kCol = kindColor(sc.kind);
                        return (
                          <div key={sc.id} style={{
                            background: "rgba(41,231,255,0.04)",
                            border: `1px solid ${kCol}33`,
                            borderRadius: 4, padding: "5px 8px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {sc.kind && (
                                <span style={{
                                  background: kCol + "22", color: kCol,
                                  border: `1px solid ${kCol}55`,
                                  borderRadius: 3, padding: "0 4px",
                                  fontSize: 7, letterSpacing: 1,
                                }}>{sc.kind}</span>
                              )}
                              <span style={{ color: "#c0d8f0", fontSize: 10 }}>{sc.name}</span>
                            </div>
                            {sc.description && (
                              <div style={{ color: DIM, fontSize: 9, marginTop: 3, lineHeight: 1.4 }}>
                                {sc.description.slice(0, 160)}
                                {sc.description.length > 160 ? "…" : ""}
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
            padding: "5px 12px", borderTop: `1px solid ${CY}22`,
            color: DIM, fontSize: 8, letterSpacing: 1,
          }}>
            AUTO-REFRESH {POLL_MS / 1000}s · /v1/ops/events + /v1/scenario/list
          </div>
        </div>
      )}
    </>
  );
}
