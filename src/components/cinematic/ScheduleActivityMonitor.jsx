/**
 * F264 Schedule & Activity Monitor
 * Polls GET /v1/schedules every 60 s (pipeline job registry + enabled status).
 * Polls GET /v1/activity every 90 s (unified notes + audit feed).
 * SCHEDULES | ACTIVITY tab switcher; toggle POST /v1/schedules/{name}/toggle.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence ops brief + TTS.
 * ⏱ SCHED button; jarvis:sched-toggle event.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const CY = "#29E7FF";
const AM = "#F59E0B";
const GN = "#34D399";
const DIM = "rgba(41,231,255,0.15)";
const API = "";

const JARVIS_API_KEY = typeof window !== "undefined"
  ? (window.__JARVIS_API_KEY__ || "dev-key")
  : "dev-key";

async function apiFetch(path, opts = {}) {
  const r = await fetch(path, {
    headers: { Authorization: `Bearer ${JARVIS_API_KEY}`, "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export function isSchedQuery(q) {
  return /\b(schedule|job schedule|sched|pipeline schedule|scheduled job|job registry|activity feed|ops activity|audit feed|what.s running|running jobs|enabled jobs)\b/i.test(q);
}

export function buildSchedScript(data) {
  const { schedules = [], activity = [] } = data || {};
  const enabled = schedules.filter(s => s.enabled).length;
  const recent = activity.slice(0, 3).map(a => `${a.resource_type || ""}:${a.body?.slice(0, 40) || ""}`).join("; ");
  return `Provide a 2-sentence operational status brief on these pipeline schedules and recent activity. Enabled jobs: ${enabled}/${schedules.length}. Recent activity: ${recent || "none"}. Focus on what is actively running and any idle or disabled jobs.`;
}

function GaugeBar({ pct, color = CY }) {
  return (
    <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s" }} />
    </div>
  );
}

function StatTile({ label, value, color = CY }) {
  return (
    <div style={{
      flex: 1, background: "rgba(41,231,255,0.04)", border: `1px solid ${color}22`,
      borderRadius: 8, padding: "8px 10px", textAlign: "center",
    }}>
      <div style={{ color, fontSize: 18, fontWeight: 700, letterSpacing: 1 }}>{value ?? "—"}</div>
      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1.5, marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function ScheduleActivityMonitor() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("SCHEDULES");
  const [schedules, setSchedules] = useState([]);
  const [jobKeys, setJobKeys] = useState([]);
  const [schedulerEnabled, setSchedulerEnabled] = useState(false);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toggling, setToggling] = useState(null);
  const [search, setSearch] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const badgeCount = schedules.filter(s => s.enabled).length;
  const hasDisabled = schedules.some(s => !s.enabled);
  const badgeColor = schedules.length > 0 ? (hasDisabled ? AM : GN) : "#4E6070";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sched, act] = await Promise.all([
        apiFetch(`${API}/v1/schedules`),
        apiFetch(`${API}/v1/activity?limit=50`),
      ]);
      setSchedules(sched.items || []);
      setJobKeys(sched.job_keys || []);
      setSchedulerEnabled(sched.enabled ?? false);
      setActivity(act.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 60000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    const h = (e) => { if (e.detail?.query && isSchedQuery(e.detail.query)) setOpen(true); };
    window.addEventListener("jarvis:ask", h);
    window.addEventListener("jarvis:sched-toggle", () => setOpen(o => !o));
    return () => {
      window.removeEventListener("jarvis:ask", h);
      window.removeEventListener("jarvis:sched-toggle", () => {});
    };
  }, []);

  const handleToggle = async (name) => {
    setToggling(name);
    try {
      await apiFetch(`${API}/v1/schedules/${name}/toggle`, { method: "POST" });
      await fetchData();
    } catch (e) {
      /* best-effort */
    } finally {
      setToggling(null);
    }
  };

  const handleAssess = async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const script = buildSchedScript({ schedules, activity });
      const r = await apiFetch(`${API}/v1/jarvis/agent/chat`, {
        method: "POST",
        body: JSON.stringify({ message: script }),
      });
      const text = r.response || r.message || r.content || "(no response)";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (e) {
      setAssessment("(assessment failed)");
    } finally {
      setAssessing(false);
    }
  };

  const filteredSchedules = schedules.filter(s =>
    !search || s.job_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.fn_key?.toLowerCase().includes(search.toLowerCase())
  );
  const filteredActivity = activity.filter(a =>
    !search ||
    (a.body || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.resource_type || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.author || "").toLowerCase().includes(search.toLowerCase())
  );

  const enabledCount = schedules.filter(s => s.enabled).length;
  const disabledCount = schedules.filter(s => !s.enabled).length;

  const fmtAge = (ts) => {
    if (!ts) return "—";
    const d = (Date.now() / 1000) - ts;
    if (d < 60) return `${Math.floor(d)}s`;
    if (d < 3600) return `${Math.floor(d / 60)}m`;
    if (d < 86400) return `${Math.floor(d / 3600)}h`;
    return `${Math.floor(d / 86400)}d`;
  };

  const fmtInterval = (s) => {
    if (!s) return "—";
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.round(s / 60)}m`;
    return `${Math.round(s / 3600)}h`;
  };

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", bottom: 8, left: 228720, zIndex: 143,
          background: open ? `${CY}22` : "rgba(5,10,18,0.88)",
          border: `1px solid ${open ? CY : CY + "44"}`,
          borderRadius: 6, color: open ? CY : "#4E6070",
          fontFamily: "'JetBrains Mono', monospace", fontSize: 9,
          letterSpacing: 1.5, padding: "4px 8px", cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ⏱ SCHED
        {schedules.length > 0 && (
          <span style={{
            marginLeft: 5, background: badgeColor,
            color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8, fontWeight: 700,
          }}>
            {badgeCount}
          </span>
        )}
      </button>

      {!open ? null : (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 9990, background: "rgba(0,4,10,0.55)" }}
          />
          <div style={{
            position: "fixed", top: "8vh", left: "50%", transform: "translateX(-50%)",
            width: "min(780px, 96vw)", maxHeight: "82vh", zIndex: 9991,
            background: "rgba(5,10,18,0.97)", border: `1px solid ${CY}33`,
            borderRadius: 16, overflow: "hidden",
            boxShadow: `0 0 80px ${CY}18, 0 24px 48px rgba(0,0,0,0.8)`,
            fontFamily: "'JetBrains Mono', monospace",
            display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ padding: "14px 18px 0", borderBottom: `1px solid ${CY}22` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ color: CY, fontSize: 14 }}>⏱</span>
                <span style={{ color: CY, fontSize: 12, letterSpacing: 2 }}>SCHEDULE & ACTIVITY MONITOR</span>
                {schedulerEnabled && (
                  <span style={{ marginLeft: "auto", background: `${GN}22`, border: `1px solid ${GN}44`,
                    borderRadius: 4, color: GN, fontSize: 9, padding: "2px 6px", letterSpacing: 1 }}>
                    SCHEDULER LIVE
                  </span>
                )}
                <button onClick={() => setOpen(false)} style={{
                  marginLeft: schedulerEnabled ? 8 : "auto",
                  background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 16,
                }}>×</button>
              </div>

              {/* Stat tiles */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <StatTile label="SCHEDULES" value={schedules.length} />
                <StatTile label="ENABLED" value={enabledCount} color={GN} />
                <StatTile label="DISABLED" value={disabledCount} color={hasDisabled ? AM : "#4E6070"} />
                <StatTile label="ACTIVITY" value={activity.length} color={AM} />
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 0 }}>
                {["SCHEDULES", "ACTIVITY"].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    background: tab === t ? DIM : "none",
                    border: "none", borderBottom: `2px solid ${tab === t ? CY : "transparent"}`,
                    color: tab === t ? CY : "#4E6070", fontFamily: "inherit",
                    fontSize: 9, letterSpacing: 2, padding: "6px 14px", cursor: "pointer",
                  }}>{t}</button>
                ))}
                {/* Search */}
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="filter…"
                  style={{
                    marginLeft: "auto", background: "rgba(41,231,255,0.06)",
                    border: `1px solid ${CY}22`, borderRadius: 5,
                    color: "#DCEBF5", fontSize: 10, letterSpacing: 1,
                    padding: "4px 10px", fontFamily: "inherit", outline: "none",
                    marginBottom: 2,
                  }}
                />
              </div>
            </div>

            {/* Body */}
            <div style={{ overflowY: "auto", flex: 1, padding: "0 0 12px" }}>
              {loading && (
                <div style={{ color: "#4E6070", fontSize: 10, letterSpacing: 1, padding: "18px", textAlign: "center" }}>
                  ◌ LOADING…
                </div>
              )}
              {error && (
                <div style={{ color: "#F43F5E", fontSize: 10, padding: "12px 18px" }}>
                  ✗ {error}
                </div>
              )}

              {!loading && tab === "SCHEDULES" && (
                <div>
                  {filteredSchedules.length === 0 && (
                    <div style={{ color: "#4E6070", fontSize: 10, padding: "18px", textAlign: "center", letterSpacing: 1 }}>
                      No schedules{search ? " match filter" : " registered"}
                    </div>
                  )}
                  {filteredSchedules.map((s, i) => (
                    <div key={s.job_name || i} style={{
                      padding: "10px 18px",
                      borderBottom: `1px solid ${CY}0D`,
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span style={{ color: "#DCEBF5", fontSize: 11, letterSpacing: 0.5 }}>
                            {s.job_name}
                          </span>
                          <span style={{
                            background: s.enabled ? `${GN}22` : `${AM}22`,
                            border: `1px solid ${s.enabled ? GN : AM}44`,
                            borderRadius: 3, color: s.enabled ? GN : AM,
                            fontSize: 8, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                          }}>{s.enabled ? "ENABLED" : "DISABLED"}</span>
                        </div>
                        <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 0.5 }}>
                          {s.fn_key} · every {fmtInterval(s.interval_s)}
                          {s.last_run_ts ? ` · last ${fmtAge(s.last_run_ts)}` : ""}
                        </div>
                        <div style={{ marginTop: 4 }}>
                          <GaugeBar
                            pct={s.enabled ? 100 : 20}
                            color={s.enabled ? GN : "#4E6070"}
                          />
                        </div>
                      </div>
                      <button
                        disabled={toggling === s.job_name}
                        onClick={() => handleToggle(s.job_name)}
                        style={{
                          background: s.enabled ? `${AM}22` : `${GN}22`,
                          border: `1px solid ${s.enabled ? AM : GN}55`,
                          borderRadius: 5, color: s.enabled ? AM : GN,
                          fontFamily: "inherit", fontSize: 9, letterSpacing: 1,
                          padding: "4px 10px", cursor: "pointer", flexShrink: 0,
                          opacity: toggling === s.job_name ? 0.5 : 1,
                        }}
                      >
                        {toggling === s.job_name ? "…" : (s.enabled ? "DISABLE" : "ENABLE")}
                      </button>
                    </div>
                  ))}
                  {jobKeys.length > 0 && (
                    <div style={{ padding: "10px 18px", borderTop: `1px solid ${CY}0D` }}>
                      <div style={{ color: "#4E6070", fontSize: 9, letterSpacing: 1, marginBottom: 6 }}>
                        REGISTERED JOB KEYS
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {jobKeys.map(k => (
                          <span key={k} style={{
                            background: `${CY}0D`, border: `1px solid ${CY}22`,
                            borderRadius: 4, color: "#7A95AB", fontSize: 9,
                            padding: "2px 7px", letterSpacing: 0.5,
                          }}>{k}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!loading && tab === "ACTIVITY" && (
                <div>
                  {filteredActivity.length === 0 && (
                    <div style={{ color: "#4E6070", fontSize: 10, padding: "18px", textAlign: "center", letterSpacing: 1 }}>
                      No activity{search ? " matches filter" : ""}
                    </div>
                  )}
                  {filteredActivity.map((a, i) => (
                    <div key={a.id || i} style={{
                      padding: "10px 18px",
                      borderBottom: `1px solid ${CY}0D`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{
                          background: `${CY}0D`, border: `1px solid ${CY}22`,
                          borderRadius: 3, color: CY, fontSize: 8,
                          padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                        }}>{a.resource_type || "SYSTEM"}</span>
                        {a.resource_id && (
                          <span style={{ color: "#4E6070", fontSize: 9 }}>#{a.resource_id}</span>
                        )}
                        <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 9 }}>
                          {a.author || "system"}
                        </span>
                        {a.created_at && (
                          <span style={{ color: "#2E4050", fontSize: 9 }}>
                            {fmtAge(typeof a.created_at === "number" ? a.created_at : Date.parse(a.created_at) / 1000)}
                          </span>
                        )}
                      </div>
                      <div style={{ color: "#7A95AB", fontSize: 10, letterSpacing: 0.3, lineHeight: 1.5 }}>
                        {(a.body || a.message || "(no body)").slice(0, 200)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              borderTop: `1px solid ${CY}1A`, padding: "8px 18px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: `${CY}18`, border: `1px solid ${CY}44`,
                  borderRadius: 5, color: CY, fontFamily: "inherit",
                  fontSize: 9, letterSpacing: 1, padding: "5px 12px",
                  cursor: "pointer", opacity: assessing ? 0.5 : 1,
                }}
              >
                {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
              </button>
              {assessment && (
                <div style={{ color: "#7A95AB", fontSize: 9, letterSpacing: 0.3, flex: 1, lineHeight: 1.5 }}>
                  {assessment.slice(0, 180)}
                </div>
              )}
              <span style={{ marginLeft: "auto", color: "#2E4050", fontSize: 9, letterSpacing: 1 }}>
                {tab === "SCHEDULES" ? `${filteredSchedules.length}/${schedules.length} jobs` : `${filteredActivity.length} events`}
              </span>
            </div>
          </div>
        </>
      )}
    </>
  );
}
