/**
 * OpsScenarioGap — F68
 * /v1/ops/events × /v1/scenario/list → keyword-correlates significant ops events against
 * scenarios to surface COVERED (has a matching plan) vs UNCOVERED (planning blind spot).
 * Voice trigger: "ops scenario"/"opscen"/"uncovered ops"/"scenario gap"/"ops plan gap"/"event scenario".
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const CY  = "#29E7FF";
const GRN = "#4ADE80";
const AMB = "#FFBB33";
const RED = "#FF4455";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const OPSCEN_RE =
  /\bops?\s*scen(?:ario)?s?\b|\bopscen\b|\buncovered\s*ops?\b|\bscenario\s*gap\b|\bops?\s*plan\s*gap\b|\bevent\s*scen(?:ario)?s?\b|\bscen(?:ario)?\s*ops?\s*gap\b/i;

export function isOpscenQuery(text) {
  return OPSCEN_RE.test(text || "");
}

async function fetchOpsEvents() {
  const r = await fetch(`${apiBase()}/v1/ops/events`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  const rows =
    Array.isArray(d)            ? d
    : Array.isArray(d?.events)  ? d.events
    : Array.isArray(d?.data)    ? d.data
    : Array.isArray(d?.items)   ? d.items
    : Array.isArray(d?.results) ? d.results
    : [];
  return rows.filter(e => !e.severity || e.severity >= 30);
}

async function fetchScenarios() {
  const r = await fetch(`${apiBase()}/v1/scenario/list`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  const d = await r.json();
  return Array.isArray(d)               ? d
    : Array.isArray(d?.scenarios)       ? d.scenarios
    : Array.isArray(d?.data)            ? d.data
    : Array.isArray(d?.items)           ? d.items
    : Array.isArray(d?.results)         ? d.results
    : [];
}

function keywords(obj) {
  return [
    obj?.name, obj?.title, obj?.description, obj?.message,
    obj?.type, obj?.category, obj?.subject, obj?.summary,
    obj?.event_type, obj?.source, obj?.scenario_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 3);
}

function correlate(events, scenarios) {
  return events.map(ev => {
    const evWords = new Set(keywords(ev));
    const matched = scenarios.filter(sc => {
      const scWords = keywords(sc);
      return scWords.some(w => evWords.has(w));
    });
    const status = matched.length > 0 ? "COVERED" : "UNCOVERED";
    return { event: ev, scenarios: matched, status };
  });
}

export async function buildOpscenScript() {
  const [evRes, scRes] = await Promise.allSettled([fetchOpsEvents(), fetchScenarios()]);
  const events    = evRes.status === "fulfilled" ? evRes.value : [];
  const scenarios = scRes.status === "fulfilled" ? scRes.value : [];
  if (!events.length) return "No significant ops events available to assess scenario coverage, sir.";
  const rows      = correlate(events, scenarios);
  const covered   = rows.filter(r => r.status === "COVERED").length;
  const uncovered = rows.filter(r => r.status === "UNCOVERED").length;
  return (
    `Ops scenario gap: ${rows.length} event${rows.length !== 1 ? "s" : ""} assessed against ` +
    `${scenarios.length} scenario${scenarios.length !== 1 ? "s" : ""}. ` +
    `${covered} COVERED by a scenario plan, ${uncovered} UNCOVERED — no matching scenario exists.`
  );
}

const TABS = ["ALL", "COVERED", "UNCOVERED"];

export default function OpsScenarioGap() {
  const [open, setOpen]           = useState(false);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [q, setQ]                 = useState("");
  const [expanded, setExpanded]   = useState(null);
  const [assessing, setAssessing] = useState(null);
  const [verdict, setVerdict]     = useState({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [events, scenarios] = await Promise.all([fetchOpsEvents(), fetchScenarios()]);
      setRows(correlate(events, scenarios));
    } catch (e) {
      setError(e.message || "Fetch error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const toggle = () => { setOpen(o => { if (!o) load(); return !o; }); };
    window.addEventListener("jarvis:opscen-toggle", toggle);
    return () => window.removeEventListener("jarvis:opscen-toggle", toggle);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, 90000);
    return () => clearInterval(id);
  }, [open, load]);

  async function assess(row, idx) {
    setAssessing(idx);
    const evName  = row.event?.title || row.event?.name || row.event?.message || row.event?.type || "this event";
    const scList  = row.scenarios.slice(0, 3).map(s => s.title || s.name || "scenario").join(", ");
    const prompt  = row.scenarios.length
      ? `Briefly assess scenario coverage for the ops event "${evName}". Matching scenarios: ${scList}. Two sentences max.`
      : `The ops event "${evName}" has NO matching scenario plan. What planning gap does this represent? Two sentences max.`;
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d   = await r.json();
      const ans = (d.answer || "No assessment available.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setVerdict(v => ({ ...v, [idx]: ans }));
      const voice = getActiveVoice?.() || "ash";
      await fetch(`${apiBase()}/v1/voice/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: ans, voice }),
      }).then(async res => {
        if (!res.ok) return;
        const url = URL.createObjectURL(await res.blob());
        const a   = new Audio(url); a.onended = () => URL.revokeObjectURL(url); a.play().catch(() => {});
      }).catch(() => {});
    } catch (_) {
      setVerdict(v => ({ ...v, [idx]: "Assessment unavailable." }));
    } finally {
      setAssessing(null);
    }
  }

  if (!open) {
    const uncovered = rows.filter(r => r.status === "UNCOVERED").length;
    return (
      <button
        onClick={() => { setOpen(true); load(); }}
        style={{
          position: "fixed", bottom: 8, left: 19080, zIndex: 76,
          background: "rgba(5,8,13,0.7)", border: `1px solid ${uncovered > 0 ? AMB : CY}44`,
          color: uncovered > 0 ? AMB : CY, fontSize: 10, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
        title="Ops Events × Scenario Gap"
      >
        ◈ OPSCEN{uncovered > 0 ? ` ${uncovered}` : ""}
      </button>
    );
  }

  const covered   = rows.filter(r => r.status === "COVERED").length;
  const uncovered = rows.filter(r => r.status === "UNCOVERED").length;

  const visible = rows.filter(r => {
    if (tab !== "ALL" && r.status !== tab) return false;
    if (q) {
      const n = (
        r.event?.title || r.event?.name || r.event?.message || r.event?.type || ""
      ).toLowerCase();
      return n.includes(q.toLowerCase());
    }
    return true;
  });

  const statusColor = s => s === "COVERED" ? GRN : RED;

  return (
    <div style={{
      position: "fixed", top: 60, right: 18, zIndex: 200, width: "min(480px,92vw)",
      background: "rgba(6,10,16,0.96)", border: `1px solid ${CY}33`, borderRadius: 12,
      fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
      boxShadow: `0 0 40px ${CY}18`, display: "flex", flexDirection: "column", maxHeight: "84vh",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${CY}22`, display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ color: CY, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>◈ OPS EVENTS × SCENARIOS</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#4A6070" }}>SCENARIO GAP</span>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#4A6070", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${CY}11` }}>
        {[
          { label: "EVENTS",    val: rows.length,                                             col: CY },
          { label: "COVERED",   val: covered,                                                 col: GRN },
          { label: "UNCOVERED", val: uncovered,                                               col: RED },
          { label: "SCENARIOS", val: rows.reduce((n, r) => n + r.scenarios.length, 0),        col: AMB },
        ].map(t => (
          <div key={t.label} style={{
            flex: 1, textAlign: "center", background: `${t.col}09`,
            border: `1px solid ${t.col}22`, borderRadius: 6, padding: "6px 0",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.col }}>{t.val}</div>
            <div style={{ fontSize: 9, color: "#4A6070", letterSpacing: 1 }}>{t.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs + search */}
      <div style={{ display: "flex", gap: 4, padding: "8px 16px 4px", borderBottom: `1px solid ${CY}11`, flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? `${CY}22` : "none", border: `1px solid ${tab === t ? CY : CY + "22"}`,
            color: tab === t ? CY : "#4A6070", fontSize: 9, letterSpacing: 1, padding: "2px 8px",
            borderRadius: 3, cursor: "pointer",
          }}>{t}</button>
        ))}
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="search events…"
          style={{
            marginLeft: "auto", background: "transparent", border: `1px solid ${CY}22`,
            color: "#DCEBF5", fontSize: 10, padding: "2px 8px", borderRadius: 3, outline: "none", width: 140,
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
        {loading && (
          <div style={{ padding: "20px", textAlign: "center", color: "#4A6070", fontSize: 11 }}>
            loading…
          </div>
        )}
        {error && (
          <div style={{ padding: "12px 16px", color: RED, fontSize: 11 }}>⚠ {error}</div>
        )}
        {!loading && !error && visible.length === 0 && (
          <div style={{ padding: "20px", textAlign: "center", color: "#4A6070", fontSize: 11 }}>
            no events match
          </div>
        )}
        {visible.map((row, idx) => {
          const evName = row.event?.title || row.event?.name || row.event?.message || row.event?.type || `Event ${idx + 1}`;
          const sev    = row.event?.severity;
          const isExp  = expanded === idx;
          const sc     = statusColor(row.status);
          return (
            <div key={idx} style={{ borderBottom: `1px solid ${CY}0D` }}>
              <div
                onClick={() => setExpanded(isExp ? null : idx)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 16px", cursor: "pointer",
                  background: isExp ? `${CY}08` : "transparent",
                }}
              >
                <span style={{
                  width: 72, textAlign: "center", fontSize: 9, letterSpacing: 1,
                  color: sc, border: `1px solid ${sc}44`, borderRadius: 3, padding: "1px 4px",
                  flexShrink: 0,
                }}>{row.status}</span>
                <span style={{ fontSize: 11, flex: 1, color: "#DCEBF5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {evName}
                </span>
                {sev != null && (
                  <span style={{ fontSize: 9, color: sev >= 80 ? RED : sev >= 50 ? AMB : "#4A6070", flexShrink: 0 }}>
                    sev {sev}
                  </span>
                )}
                <span style={{ fontSize: 9, color: "#4A6070", flexShrink: 0 }}>
                  {row.scenarios.length} plan{row.scenarios.length !== 1 ? "s" : ""}
                </span>
                <span style={{ fontSize: 10, color: "#2E4050" }}>{isExp ? "▲" : "▼"}</span>
              </div>

              {isExp && (
                <div style={{ padding: "6px 16px 10px 24px" }}>
                  {row.scenarios.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      {row.scenarios.slice(0, 5).map((sc, si) => (
                        <div key={si} style={{
                          padding: "4px 8px", marginBottom: 3, borderRadius: 4,
                          background: `${GRN}09`, border: `1px solid ${GRN}22`,
                        }}>
                          <span style={{ fontSize: 10, color: GRN }}>
                            {sc.title || sc.name || sc.id || "Untitled scenario"}
                          </span>
                          {sc.scenario_type && (
                            <span style={{ marginLeft: 8, fontSize: 9, color: "#4A6070" }}>{sc.scenario_type}</span>
                          )}
                          {sc.description && (
                            <div style={{ fontSize: 9, color: "#4A6070", marginTop: 2 }}>
                              {String(sc.description).slice(0, 100)}{sc.description.length > 100 ? "…" : ""}
                            </div>
                          )}
                        </div>
                      ))}
                      {row.scenarios.length > 5 && (
                        <div style={{ fontSize: 9, color: "#4A6070", padding: "2px 8px" }}>
                          +{row.scenarios.length - 5} more scenarios
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: RED, marginBottom: 8, padding: "4px 8px" }}>
                      No scenario covers this ops event — planning blind spot.
                    </div>
                  )}

                  {verdict[idx] && (
                    <div style={{
                      padding: "6px 8px", borderRadius: 4, background: `${CY}09`,
                      border: `1px solid ${CY}22`, fontSize: 10, color: "#DCEBF5", marginBottom: 6,
                    }}>
                      {verdict[idx]}
                    </div>
                  )}

                  <button
                    onClick={() => assess(row, idx)}
                    disabled={assessing === idx}
                    style={{
                      background: assessing === idx ? `${CY}11` : `${CY}18`,
                      border: `1px solid ${CY}44`, color: CY, fontSize: 9, letterSpacing: 1,
                      padding: "3px 10px", borderRadius: 3, cursor: assessing === idx ? "default" : "pointer",
                    }}
                  >
                    {assessing === idx ? "…assessing" : "▶ ASSESS GAP"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        padding: "6px 16px", borderTop: `1px solid ${CY}11`,
        fontSize: 9, color: "#2E4050", display: "flex", gap: 12,
      }}>
        <span>{rows.length} events · {rows.reduce((n, r) => n + r.scenarios.length, 0)} scenario links</span>
        <button onClick={load} style={{ marginLeft: "auto", background: "none", border: "none", color: `${CY}66`, cursor: "pointer", fontSize: 9 }}>↺ refresh</button>
      </div>
    </div>
  );
}
