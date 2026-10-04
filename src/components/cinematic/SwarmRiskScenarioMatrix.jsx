/**
 * F76 — Swarm × Risk Signal × Scenario Mission Risk Matrix (SRSM)
 * Endpoints: /entities/SwarmJob × /entities/RiskSignal × /v1/scenario/list
 * Classification: EXPOSED (risk, no scenario) | RISK_MANAGED (risk + scenario) | MONITORED (scenario only) | CLEAR (neither)
 */
import { useEffect, useState, useRef } from "react";

const BTN_LEFT = 986_040;
const POLL_MS = 90_000;

const API_KEY =
  (typeof window !== "undefined" && window.__JARVIS_API_KEY__) ||
  import.meta.env?.VITE_API_KEY ||
  "";

function apiBase() {
  return (
    (typeof window !== "undefined" && window.__JARVIS_API_BASE__) ||
    import.meta.env?.VITE_API_BASE ||
    ""
  );
}

const SRSM_RE =
  /\b(srsm|swarm\s*risk\s*scenario|swarm\s*risk\s*matrix|mission\s*risk\s*matrix|exposed\s*swarm|unmitigated\s*swarm|swarm\s*mission\s*risk|swarm\s*scenario\s*risk|risk\s*managed\s*swarm)\b/i;

export function isSrsmQuery(t) {
  return SRSM_RE.test(t || "");
}

function normaliseJob(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.job_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.job_type || raw.type || "Untitled Job",
    description: raw.description || raw.details || raw.summary || "",
    status: raw.status || raw.state || "",
    type: raw.type || raw.job_type || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseRisk(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.signal_id || raw._id || String(Math.random()),
    title: raw.title || raw.name || raw.signal_type || "Untitled Signal",
    description: raw.description || raw.details || raw.summary || "",
    severity: (raw.severity || raw.level || raw.priority || "medium").toLowerCase(),
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function normaliseScenario(raw) {
  if (!raw) return null;
  return {
    id: raw.id || raw.scenario_id || raw._id || String(Math.random()),
    name: raw.name || raw.title || raw.scenario_name || "Untitled Scenario",
    description: raw.description || raw.details || raw.summary || "",
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    extra: raw,
  };
}

function tokenize(s) {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function score(jobTokens, other) {
  const otherTokens = tokenize(`${other.name || other.title || ""} ${other.description || ""} ${(other.tags || []).join(" ")}`);
  if (!jobTokens.length || !otherTokens.length) return 0;
  const set = new Set(otherTokens);
  return jobTokens.filter((t) => set.has(t)).length;
}

const SEV_COLOR = { critical: "#ff3b3b", high: "#ff9800", medium: "#ffc107", low: "#4ade80" };
const CY = "#00e5ff";

const CLASS_META = {
  EXPOSED: { label: "EXPOSED", color: "#ff3b3b", desc: "Risk signal active — no scenario cover" },
  RISK_MANAGED: { label: "RISK MANAGED", color: "#4ade80", desc: "Risk mitigated by scenario" },
  MONITORED: { label: "MONITORED", color: "#ffc107", desc: "Scenario coverage only" },
  CLEAR: { label: "CLEAR", color: "#6E8AA0", desc: "No risk or scenario match" },
};

function classify(matchedRisk, matchedScenario) {
  const hasRisk = matchedRisk.length > 0;
  const hasScenario = matchedScenario.length > 0;
  if (hasRisk && !hasScenario) return "EXPOSED";
  if (hasRisk && hasScenario) return "RISK_MANAGED";
  if (!hasRisk && hasScenario) return "MONITORED";
  return "CLEAR";
}

export async function buildSrsmScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  const [jobsRes, riskRes, scenRes] = await Promise.allSettled([
    fetch(`${base}/entities/SwarmJob`, { headers }).then((r) => r.json()),
    fetch(`${base}/entities/RiskSignal`, { headers }).then((r) => r.json()),
    fetch(`${base}/v1/scenario/list`, { headers }).then((r) => r.json()),
  ]);

  const jobs = (jobsRes.status === "fulfilled" ? jobsRes.value : []);
  const risks = (riskRes.status === "fulfilled" ? riskRes.value : []);
  const scenarios = (scenRes.status === "fulfilled" ? scenRes.value : []);

  const jobArr = (Array.isArray(jobs) ? jobs : jobs?.items || jobs?.data || []).map(normaliseJob).filter(Boolean);
  const riskArr = (Array.isArray(risks) ? risks : risks?.items || risks?.data || []).map(normaliseRisk).filter(Boolean);
  const scenArr = (Array.isArray(scenarios) ? scenarios : scenarios?.items || scenarios?.data || []).map(normaliseScenario).filter(Boolean);

  const exposed = jobArr.filter((j) => {
    const tok = tokenize(`${j.name} ${j.description} ${j.tags.join(" ")}`);
    const hasRisk = riskArr.some((r) => score(tok, r) > 0);
    const hasSc = scenArr.some((s) => score(tok, s) > 0);
    return hasRisk && !hasSc;
  });

  return `Swarm Mission Risk Matrix online, sir. ${jobArr.length} swarm jobs analysed against ${riskArr.length} risk signals and ${scenArr.length} scenarios. ${exposed.length} job${exposed.length !== 1 ? "s" : ""} are EXPOSED — active risk with no scenario cover. Recommend immediate scenario assignment for unmitigated operations.`;
}

const TABS = ["ALL", "EXPOSED", "RISK_MANAGED", "MONITORED", "CLEAR"];

export default function SwarmRiskScenarioMatrix() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [brief, setBrief] = useState("");
  const [assessing, setAssessing] = useState(false);
  const timerRef = useRef(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const base = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [jobsRes, riskRes, scenRes] = await Promise.allSettled([
        fetch(`${base}/entities/SwarmJob`, { headers }).then((r) => r.json()),
        fetch(`${base}/entities/RiskSignal`, { headers }).then((r) => r.json()),
        fetch(`${base}/v1/scenario/list`, { headers }).then((r) => r.json()),
      ]);

      const jobs = jobsRes.status === "fulfilled" ? jobsRes.value : [];
      const risks = riskRes.status === "fulfilled" ? riskRes.value : [];
      const scenarios = scenRes.status === "fulfilled" ? scenRes.value : [];

      const jobArr = (Array.isArray(jobs) ? jobs : jobs?.items || jobs?.data || []).map(normaliseJob).filter(Boolean);
      const riskArr = (Array.isArray(risks) ? risks : risks?.items || risks?.data || []).map(normaliseRisk).filter(Boolean);
      const scenArr = (Array.isArray(scenarios) ? scenarios : scenarios?.items || scenarios?.data || []).map(normaliseScenario).filter(Boolean);

      const mapped = jobArr.map((job) => {
        const tok = tokenize(`${job.name} ${job.description} ${job.tags.join(" ")}`);
        const matchedRisk = riskArr
          .map((r) => ({ ...r, score: score(tok, r) }))
          .filter((r) => r.score > 0)
          .sort((a, b) => b.score - a.score);
        const matchedScenario = scenArr
          .map((s) => ({ ...s, score: score(tok, s) }))
          .filter((s) => s.score > 0)
          .sort((a, b) => b.score - a.score);
        return {
          job,
          matchedRisk,
          matchedScenario,
          cls: classify(matchedRisk, matchedScenario),
        };
      });

      setRows(mapped);
    } catch (e) {
      setError(e?.message || "fetch error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  useEffect(() => {
    const h = () => setOpen((v) => !v);
    window.addEventListener("jarvis:srsm-toggle", h);
    return () => window.removeEventListener("jarvis:srsm-toggle", h);
  }, []);

  const counts = {
    EXPOSED: rows.filter((r) => r.cls === "EXPOSED").length,
    RISK_MANAGED: rows.filter((r) => r.cls === "RISK_MANAGED").length,
    MONITORED: rows.filter((r) => r.cls === "MONITORED").length,
    CLEAR: rows.filter((r) => r.cls === "CLEAR").length,
  };

  const visible = rows.filter((r) => {
    const matchTab = tab === "ALL" || r.cls === tab;
    const matchSearch = !search || r.job.name.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  async function assess() {
    setAssessing(true);
    setBrief("");
    try {
      const base = apiBase();
      const snapshot = rows.slice(0, 12).map((r) => ({
        job: r.job.name,
        status: r.job.status,
        cls: r.cls,
        topRisk: r.matchedRisk[0]?.title,
        topScenario: r.matchedScenario[0]?.name,
      }));
      const prompt = `Swarm Mission Risk Matrix snapshot: ${JSON.stringify(snapshot)}. Write a 2-sentence operational risk assessment focusing on exposed swarm jobs and recommended mitigations.`;
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: prompt }),
      });
      const d = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body: JSON.stringify({ text }),
        }).then((r2) => r2.arrayBuffer()).then((buf) => {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          ctx.decodeAudioData(buf, (decoded) => {
            const src = ctx.createBufferSource();
            src.buffer = decoded;
            src.connect(ctx.destination);
            src.start();
          });
        }).catch(() => {});
      }
    } catch {
      setBrief("Unable to reach reasoning core.");
    } finally {
      setAssessing(false);
    }
  }

  const exposedBadge = counts.EXPOSED;

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Swarm × Risk × Scenario Mission Risk Matrix (SRSM)"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 139,
          padding: "4px 10px",
          background: exposedBadge > 0 ? "rgba(255,59,59,0.15)" : "rgba(5,8,13,0.7)",
          border: `1px solid ${exposedBadge > 0 ? "#ff3b3b" : CY}`,
          borderRadius: 6,
          color: exposedBadge > 0 ? "#ff3b3b" : CY,
          fontSize: 11,
          letterSpacing: 1,
          cursor: "pointer",
          fontFamily: "'JetBrains Mono',monospace",
          whiteSpace: "nowrap",
        }}
      >
        ◈ SRSM
        {exposedBadge > 0 && (
          <span style={{
            marginLeft: 5, background: "#ff3b3b", color: "#fff",
            borderRadius: 8, padding: "1px 5px", fontSize: 9,
          }}>{exposedBadge}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
          zIndex: 2000, width: "min(760px,92vw)", maxHeight: "82vh",
          background: "rgba(4,8,14,0.97)", border: `1px solid ${CY}33`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          fontFamily: "'JetBrains Mono',monospace", color: "#DCEBF5",
          boxShadow: `0 0 60px ${CY}18`,
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderBottom: `1px solid ${CY}22`,
          }}>
            <span style={{ color: CY, fontWeight: 700, fontSize: 13, letterSpacing: 2 }}>◈ SWARM MISSION RISK MATRIX</span>
            <span style={{ fontSize: 10, color: "#6E8AA0", marginLeft: 4 }}>SwarmJob × RiskSignal × Scenario</span>
            <button onClick={() => setOpen(false)} style={{
              marginLeft: "auto", background: "none", border: "none",
              color: "#6E8AA0", fontSize: 16, cursor: "pointer",
            }}>✕</button>
          </div>

          <div style={{ overflowY: "auto", padding: "12px 16px", flex: 1 }}>
            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {[
                { label: "JOBS", val: rows.length, color: CY },
                { label: "EXPOSED", val: counts.EXPOSED, color: "#ff3b3b" },
                { label: "RISK MANAGED", val: counts.RISK_MANAGED, color: "#4ade80" },
                { label: "MONITORED", val: counts.MONITORED, color: "#ffc107" },
                { label: "CLEAR", val: counts.CLEAR, color: "#6E8AA0" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{
                  background: `${color}11`, border: `1px solid ${color}33`,
                  borderRadius: 8, padding: "6px 12px", minWidth: 80, textAlign: "center",
                }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                  <div style={{ fontSize: 9, color: "#6E8AA0", letterSpacing: 1 }}>{label}</div>
                </div>
              ))}
              <button onClick={load} disabled={loading} style={{
                marginLeft: "auto", padding: "4px 10px", background: `${CY}11`,
                border: `1px solid ${CY}33`, borderRadius: 6, color: CY,
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
              }}>↻ REFRESH</button>
              <button onClick={assess} disabled={assessing} style={{
                padding: "4px 10px", background: "#ff3b3b11",
                border: "1px solid #ff3b3b33", borderRadius: 6, color: "#ff3b3b",
                fontSize: 10, cursor: "pointer", letterSpacing: 1,
              }}>{assessing ? "…" : "▶ ASSESS RISK"}</button>
            </div>

            {brief && (
              <div style={{
                fontSize: 11, color: "#88ccaa", background: "#0a1820",
                border: `1px solid ${CY}22`, borderRadius: 6,
                padding: "8px 10px", marginBottom: 10, lineHeight: 1.5,
              }}>{brief}</div>
            )}

            {/* Filter tabs */}
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "3px 10px", borderRadius: 5, fontSize: 10,
                  cursor: "pointer", letterSpacing: 1,
                  background: tab === t ? `${CLASS_META[t]?.color || CY}22` : "transparent",
                  border: `1px solid ${tab === t ? (CLASS_META[t]?.color || CY) : "#6E8AA0"}`,
                  color: tab === t ? (CLASS_META[t]?.color || CY) : "#6E8AA0",
                }}>{t}</button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search jobs…"
                style={{
                  marginLeft: "auto", background: "#0a1820", border: `1px solid ${CY}33`,
                  borderRadius: 5, color: "#DCEBF5", fontSize: 10, padding: "3px 8px",
                  outline: "none", width: 130,
                }}
              />
            </div>

            {loading && <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 20 }}>loading…</div>}
            {error && <div style={{ color: "#ff6b6b", fontSize: 11, marginBottom: 8 }}>⚠ {error}</div>}

            {/* Job list */}
            {!loading && visible.map((row) => {
              const meta = CLASS_META[row.cls];
              const isExp = expanded === row.job.id;
              return (
                <div key={row.job.id} style={{
                  marginBottom: 6, border: `1px solid ${meta.color}33`,
                  borderRadius: 8, overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpanded(isExp ? null : row.job.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "7px 10px", cursor: "pointer",
                      background: `${meta.color}08`,
                    }}
                  >
                    <span style={{
                      fontSize: 10, padding: "1px 6px", borderRadius: 4,
                      background: `${meta.color}22`, color: meta.color,
                      letterSpacing: 1, whiteSpace: "nowrap",
                    }}>{meta.label}</span>
                    <span style={{
                      fontSize: 12, flex: 1, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{row.job.name}</span>
                    {row.job.status && (
                      <span style={{ fontSize: 10, color: "#6E8AA0", whiteSpace: "nowrap" }}>{row.job.status}</span>
                    )}
                    <span style={{ fontSize: 10, color: "#6E8AA0" }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{
                      padding: "8px 10px", background: "rgba(4,8,14,0.6)",
                      borderTop: `1px solid ${meta.color}22`,
                    }}>
                      {row.job.description && (
                        <div style={{ fontSize: 11, color: "#88a0b0", marginBottom: 8, lineHeight: 1.4 }}>
                          {row.job.description.slice(0, 200)}{row.job.description.length > 200 ? "…" : ""}
                        </div>
                      )}

                      {/* Matched risk signals */}
                      {row.matchedRisk.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 10, color: "#ff3b3b", letterSpacing: 1, marginBottom: 4 }}>
                            RISK SIGNALS ({row.matchedRisk.length})
                          </div>
                          {row.matchedRisk.slice(0, 3).map((r) => (
                            <div key={r.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{r.title}</span>
                                <span style={{
                                  fontSize: 9, padding: "1px 5px", borderRadius: 3,
                                  background: `${SEV_COLOR[r.severity] || "#6E8AA0"}22`,
                                  color: SEV_COLOR[r.severity] || "#6E8AA0",
                                }}>{r.severity.toUpperCase()}</span>
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width: `${Math.min(100, r.score * 12)}%`,
                                  height: "100%", background: SEV_COLOR[r.severity] || "#ff3b3b", borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Matched scenarios */}
                      {row.matchedScenario.length > 0 && (
                        <div>
                          <div style={{ fontSize: 10, color: "#4ade80", letterSpacing: 1, marginBottom: 4 }}>
                            SCENARIOS ({row.matchedScenario.length})
                          </div>
                          {row.matchedScenario.slice(0, 3).map((s) => (
                            <div key={s.id} style={{ marginBottom: 4 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                                <span style={{ color: "#DCEBF5" }}>{s.name}</span>
                                <span style={{ color: "#4ade80", fontSize: 10 }}>+{s.score}</span>
                              </div>
                              <div style={{ background: "#111827", borderRadius: 3, height: 3, marginTop: 2 }}>
                                <div style={{
                                  width: `${Math.min(100, s.score * 12)}%`,
                                  height: "100%", background: "#4ade80", borderRadius: 3,
                                }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {row.matchedRisk.length === 0 && row.matchedScenario.length === 0 && (
                        <div style={{ fontSize: 11, color: "#6E8AA0" }}>No correlated risk signals or scenarios detected.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && visible.length === 0 && !error && (
              <div style={{ textAlign: "center", color: "#6E8AA0", fontSize: 12, padding: 30 }}>
                No swarm jobs match current filter.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
