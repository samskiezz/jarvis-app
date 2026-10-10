import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY = "#00E5FF";
const AM = "#FFB300";
const GR = "#4CAF50";
const DIM = "#6E8AA0";
const API_KEY = import.meta.env.VITE_JARVIS_API_KEY || "dev-key";
const REFRESH_MS = 90_000;
const BTN_LEFT = 980_440;

// ── Query matchers exported for JarvisBrain ───────────────────────────────
const OESGA_RE = /\b(oesga|ops[\s_-]*scenario[\s_-]*gap|event[\s_-]*coverage|uncovered[\s_-]*events?|scenario[\s_-]*gap|playbook[\s_-]*gap|ops[\s_-]*event[\s_-]*scenario|unplanned[\s_-]*events?)\b/i;
export function isOesgaQuery(q) { return OESGA_RE.test(q); }

function keywords(str = "") {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 3);
}

function relevance(event, scenario) {
  const ekw = keywords(
    `${event.type || ""} ${event.description || ""} ${event.category || ""} ${event.title || ""} ${(event.tags || []).join(" ")}`
  );
  const skw = keywords(
    `${scenario.name || scenario.title || ""} ${scenario.description || ""} ${scenario.type || ""} ${(scenario.tags || []).join(" ")}`
  );
  if (!ekw.length || !skw.length) return 0;
  const shared = ekw.filter(w => skw.includes(w));
  return shared.length / Math.max(ekw.length, skw.length);
}

export async function buildOesgaScript() {
  const base = apiBase();
  const [evRes, scRes] = await Promise.allSettled([
    fetch(`${base}/v1/ops/events`).then(r => r.json()),
    fetch(`${base}/v1/scenario/list`).then(r => r.json()),
  ]);

  const events = evRes.status === "fulfilled"
    ? (evRes.value?.items || evRes.value || [])
    : [];
  const scenarios = scRes.status === "fulfilled"
    ? (scRes.value?.items || scRes.value || [])
    : [];

  const covered   = events.filter(ev => scenarios.some(sc => relevance(ev, sc) > 0));
  const uncovered = events.filter(ev => !scenarios.some(sc => relevance(ev, sc) > 0));

  const snapshot =
    `Ops events: ${events.length} total, ${covered.length} scenario-covered, ` +
    `${uncovered.length} without a matching playbook. Scenarios available: ${scenarios.length}.`;

  const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message: `Ops event scenario gap analysis. Provide exactly 2 sentences: current playbook coverage status for operational events, and recommended action for uncovered events. Data: ${snapshot}`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim()
    || `${covered.length} of ${events.length} ops events have matching scenario playbooks. ${uncovered.length} events lack coverage and represent planning gaps that should be addressed.`;
}

// ── Component ─────────────────────────────────────────────────────────────
export default function OpsEventScenarioGap() {
  const [open, setOpen]       = useState(false);
  const [events, setEvents]   = useState([]);
  const [scenarios, setScens] = useState([]);
  const [enriched, setEnriched] = useState([]);
  const [tab, setTab]         = useState("ALL");
  const [search, setSearch]   = useState("");
  const [expanded, setExpanded] = useState(null);
  const [assessing, setAssess]  = useState(false);
  const [brief, setBrief]     = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    const base = apiBase();
    const [evRes, scRes] = await Promise.allSettled([
      fetch(`${base}/v1/ops/events`).then(r => r.json()),
      fetch(`${base}/v1/scenario/list`).then(r => r.json()),
    ]);
    const evList = evRes.status === "fulfilled"
      ? (evRes.value?.items || evRes.value || []) : [];
    const scList = scRes.status === "fulfilled"
      ? (scRes.value?.items || scRes.value || []) : [];
    setEvents(evList);
    setScens(scList);

    const enrichedList = evList.map(ev => {
      const matches = scList
        .map(sc => ({ ...sc, score: relevance(ev, sc) }))
        .filter(sc => sc.score > 0)
        .sort((a, b) => b.score - a.score);
      return { ...ev, matches, covered: matches.length > 0 };
    });
    setEnriched(enrichedList);
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen(v => !v);
    window.addEventListener("jarvis:oesga-toggle", toggle);
    return () => window.removeEventListener("jarvis:oesga-toggle", toggle);
  }, []);

  const covered   = enriched.filter(e => e.covered);
  const uncovered = enriched.filter(e => !e.covered);
  const badgeCount = uncovered.length;

  const filtered = enriched
    .filter(e =>
      (tab === "ALL"       ? true :
       tab === "COVERED"   ? e.covered :
       !e.covered)
    )
    .filter(e => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        (e.type || "").toLowerCase().includes(s) ||
        (e.description || "").toLowerCase().includes(s) ||
        (e.title || "").toLowerCase().includes(s)
      );
    });

  async function assess() {
    setAssess(true); setBrief("");
    try {
      const script = await buildOesgaScript();
      setBrief(script);
    } catch {
      setBrief("Unable to reach assessment core. Review ops event playbook coverage manually.");
    } finally {
      setAssess(false);
    }
  }

  const label = (ev) =>
    ev.type || ev.category || ev.title || ev.description?.slice(0, 30) || ev.id || "Event";

  const TABS = ["ALL", "COVERED", "UNCOVERED"];
  const TAB_COLOR = { ALL: CY, COVERED: GR, UNCOVERED: AM };

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Ops Event × Scenario Gap Analysis"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 128,
          background: open ? AM : "rgba(5,8,13,0.75)",
          border: `1px solid ${AM}88`, borderRadius: 6, padding: "3px 9px",
          color: open ? "#04060A" : AM, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10, letterSpacing: 1.5, cursor: "pointer",
          boxShadow: badgeCount > 0 ? `0 0 12px ${AM}88` : "none",
        }}
      >
        ◈ OESGA
        {badgeCount > 0 && (
          <span style={{
            marginLeft: 5, background: AM, color: "#04060A", borderRadius: 9,
            padding: "1px 5px", fontSize: 9, fontWeight: 700,
          }}>
            {badgeCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: 3200, width: "min(720px,94vw)", maxHeight: "80vh",
          background: "rgba(6,10,18,0.97)", border: `1px solid ${AM}55`,
          borderRadius: 14, padding: "18px 20px", overflow: "hidden",
          display: "flex", flexDirection: "column", gap: 12,
          fontFamily: "'JetBrains Mono',monospace",
          backdropFilter: "blur(14px)", boxShadow: `0 0 60px ${AM}22`,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: AM, fontSize: 13, letterSpacing: 2, fontWeight: 700 }}>
              ◈ OPS EVENT × SCENARIO GAP
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ marginLeft: "auto", background: "none", border: "none",
                color: DIM, cursor: "pointer", fontSize: 16 }}
            >✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              { label: "EVENTS",    val: events.length,    col: CY },
              { label: "SCENARIOS", val: scenarios.length, col: CY },
              { label: "COVERED",   val: covered.length,   col: GR },
              { label: "UNCOVERED", val: uncovered.length, col: AM },
            ].map(({ label: lbl, val, col }) => (
              <div key={lbl} style={{
                background: "rgba(255,255,255,0.04)", border: `1px solid ${col}44`,
                borderRadius: 8, padding: "6px 14px", textAlign: "center",
              }}>
                <div style={{ color: col, fontSize: 18, fontWeight: 700 }}>{val}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1.5 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? TAB_COLOR[t] : "transparent",
                  border: `1px solid ${TAB_COLOR[t]}66`,
                  borderRadius: 5, padding: "2px 10px", color: tab === t ? "#04060A" : TAB_COLOR[t],
                  fontSize: 9, letterSpacing: 1.2, cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="search events…"
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,0.05)",
                border: `1px solid ${DIM}44`, borderRadius: 5, padding: "3px 10px",
                color: CY, fontSize: 10, outline: "none", width: 160,
              }}
            />
          </div>

          {/* Event list */}
          <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            {filtered.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                {events.length === 0 ? "Loading ops events…" : "No events match filter."}
              </div>
            )}
            {filtered.map((ev, i) => (
              <div key={ev.id || i} style={{
                background: "rgba(255,255,255,0.03)", border: `1px solid ${ev.covered ? GR : AM}33`,
                borderRadius: 8, padding: "8px 12px", cursor: "pointer",
              }}
                onClick={() => setExpanded(expanded === i ? null : i)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 9, padding: "1px 6px", borderRadius: 4, letterSpacing: 1,
                    background: ev.covered ? `${GR}22` : `${AM}22`,
                    color: ev.covered ? GR : AM, border: `1px solid ${ev.covered ? GR : AM}44`,
                  }}>
                    {ev.covered ? "COVERED" : "UNCOVERED"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{label(ev)}</span>
                  {ev.severity && (
                    <span style={{ color: DIM, fontSize: 9 }}>{ev.severity}</span>
                  )}
                  <span style={{ color: DIM, fontSize: 10 }}>{expanded === i ? "▲" : "▼"}</span>
                </div>

                {/* Description snippet */}
                {ev.description && (
                  <div style={{ color: DIM, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>
                    {ev.description.slice(0, 100)}{ev.description.length > 100 ? "…" : ""}
                  </div>
                )}

                {/* Expanded: matched scenarios */}
                {expanded === i && ev.matches.length > 0 && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ color: DIM, fontSize: 9, letterSpacing: 1.5, marginBottom: 2 }}>
                      MATCHED SCENARIOS ({ev.matches.length})
                    </div>
                    {ev.matches.slice(0, 5).map((sc, j) => (
                      <div key={j} style={{
                        background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "5px 9px",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ color: GR, fontSize: 10 }}>
                            {sc.name || sc.title || sc.id || "Scenario"}
                          </span>
                          {sc.type && (
                            <span style={{
                              fontSize: 9, padding: "0 5px", borderRadius: 3,
                              background: `${CY}22`, color: CY, border: `1px solid ${CY}33`,
                            }}>{sc.type}</span>
                          )}
                        </div>
                        {/* Relevance bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{
                            height: 3, borderRadius: 2, flex: 1,
                            background: `${GR}22`,
                          }}>
                            <div style={{
                              height: "100%", borderRadius: 2,
                              width: `${Math.round(sc.score * 100)}%`,
                              background: GR,
                            }} />
                          </div>
                          <span style={{ color: DIM, fontSize: 9 }}>{Math.round(sc.score * 100)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {expanded === i && ev.matches.length === 0 && (
                  <div style={{ marginTop: 8, color: AM, fontSize: 10 }}>
                    No matching scenario playbook found for this event type.
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Assess button + brief */}
          <div style={{ borderTop: `1px solid ${AM}22`, paddingTop: 10 }}>
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                background: assessing ? "transparent" : `${AM}22`,
                border: `1px solid ${AM}55`, borderRadius: 6,
                padding: "5px 16px", color: AM, fontSize: 10,
                letterSpacing: 1.5, cursor: assessing ? "wait" : "pointer",
              }}
            >
              {assessing ? "◌ ASSESSING…" : "▶ ASSESS GAP"}
            </button>
            {brief && (
              <div style={{
                marginTop: 8, color: "#DCEBF5", fontSize: 11, lineHeight: 1.5,
                background: "rgba(255,179,0,0.06)", borderRadius: 6, padding: "8px 12px",
                border: `1px solid ${AM}33`,
              }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
