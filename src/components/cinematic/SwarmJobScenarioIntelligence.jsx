/**
 * SwarmJobScenarioIntelligence — F102 (SJSI)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/scenario/list every 90 s.
 * Keyword-correlates each swarm job against scenario definitions.
 * Classification: PLANNED (≥1 correlated scenario) vs UNPLANNED (0).
 * Amber badge on unplanned count.
 *
 * Voice intents: "swarm scenario / scenario swarm / sjsi / unplanned swarm /
 *                swarm plan / swarm without scenario / swarm coverage scenario /
 *                which swarm jobs have scenarios / swarm scenario coverage"
 * Strip button: ◈ SJSI  left:3360 bottom:18 zIndex:68
 * Custom event: jarvis:sjsi-toggle
 * Additive only — mounted via App.jsx; intents exported for JarvisBrain.
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AMB = "#FFD700";
const GRN = "#00E5A0";
const RED = "#FF4D6D";
const PRP = "#B485FF";
const POLL = 90_000;

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";
const hdrs = { Authorization: `Bearer ${API_KEY}` };

// ─── exported helpers for JarvisBrain ────────────────────────────────────────

export function isSjsiQuery(q) {
  const t = (q || "").toLowerCase();
  return (
    t.includes("sjsi") ||
    t.includes("swarm scenario") ||
    t.includes("scenario swarm") ||
    t.includes("unplanned swarm") ||
    t.includes("swarm plan") ||
    t.includes("swarm without scenario") ||
    t.includes("swarm coverage scenario") ||
    t.includes("which swarm jobs have scenario") ||
    t.includes("swarm scenario coverage")
  );
}

function normArr(d) {
  return Array.isArray(d) ? d : (d?.data || d?.items || d?.results || d?.scenarios || d?.jobs || []);
}

function tokenize(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function scoreMatch(jobText, scenText) {
  const a = new Set(tokenize(jobText));
  const b = tokenize(scenText);
  const hits = b.filter(w => a.has(w)).length;
  return hits / Math.max(b.length, 1);
}

export async function buildSjsiScript() {
  try {
    const base = apiBase();
    const [jr, sr] = await Promise.all([
      fetch(`${base}/entities/SwarmJob`, { headers: hdrs }).then(r => r.json()).catch(() => []),
      fetch(`${base}/v1/scenario/list`,  { headers: hdrs }).then(r => r.json()).catch(() => []),
    ]);
    const jobs      = normArr(jr);
    const scenarios = normArr(sr);
    let planned = 0, unplanned = 0;
    for (const job of jobs) {
      const jText = [job.name, job.description, job.target, job.objective, (job.tags || []).join(" ")].join(" ");
      const found = scenarios.some(sc => {
        const sText = [sc.name, sc.title, sc.description, sc.type, (sc.tags || []).join(" ")].join(" ");
        return scoreMatch(jText, sText) > 0;
      });
      if (found) planned++; else unplanned++;
    }
    return (
      `SwarmJob × Scenario Intelligence: ${jobs.length} swarm jobs correlated against ` +
      `${scenarios.length} scenarios. ${planned} PLANNED (backed by a scenario), ` +
      `${unplanned} UNPLANNED (no scenario coverage).`
    );
  } catch (e) {
    return `SJSI check failed: ${e.message}`;
  }
}

// ─── assess helper ────────────────────────────────────────────────────────────

async function runAssess(correlated, setText, speak) {
  const planned   = correlated.filter(j => j.planned).length;
  const unplanned = correlated.filter(j => !j.planned).length;
  const topUnplan = correlated
    .filter(j => !j.planned)
    .slice(0, 2)
    .map(j => j.name || j.id)
    .join(", ");
  const prompt =
    `You are JARVIS. In 2 sentences, brief the operator on SwarmJob × Scenario coverage: ` +
    `${planned} swarm jobs have at least one matching scenario (PLANNED) and ` +
    `${unplanned} swarm jobs have zero scenario coverage (UNPLANNED)` +
    (topUnplan ? ` — most exposed: ${topUnplan}` : "") +
    `. Conclude with the priority recommendation for reducing unplanned swarm exposure.`;
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" };
  try {
    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST", headers, body: JSON.stringify({ message: prompt }),
    });
    const j    = await r.json();
    const text = j.response || j.reply || j.message || j.answer || JSON.stringify(j);
    setText(text);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    speak(text);
  } catch (e) {
    setText(`ASSESS error: ${e.message}`);
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function SwarmJobScenarioIntelligence() {
  const [open,       setOpen]       = useState(false);
  const [jobs,       setJobs]       = useState([]);
  const [scenarios,  setScenarios]  = useState([]);
  const [correlated, setCorrelated] = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState({});
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [assessed,   setAssessed]   = useState("");
  const [assessing,  setAssessing]  = useState(false);

  const timerRef = useRef(null);
  const speakRef = useRef(null);

  // TTS helper
  function speak(text) {
    const base = apiBase();
    fetch(`${base}/v1/voice/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 300) }),
    }).then(r => r.arrayBuffer()).then(buf => {
      const ctx = new AudioContext();
      ctx.decodeAudioData(buf, decoded => {
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        src.connect(ctx.destination);
        src.start();
      });
    }).catch(() => {});
  }
  speakRef.current = speak;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const base = apiBase();
      const [jr, sr] = await Promise.all([
        fetch(`${base}/entities/SwarmJob`, { headers: hdrs }),
        fetch(`${base}/v1/scenario/list`,  { headers: hdrs }),
      ]);
      const jd = jr.ok ? await jr.json() : {};
      const sd = sr.ok ? await sr.json() : {};

      const rawJobs = normArr(jd).map(j => ({
        id:          j.id || j._id || String(Math.random()),
        name:        j.name || j.title || "Unnamed job",
        description: j.description || j.objective || "",
        target:      j.target || "",
        objective:   j.objective || "",
        status:      j.status || j.state || "unknown",
        tags:        j.tags || [],
      }));

      const rawScens = normArr(sd).map(s => ({
        id:          s.id || s._id || String(Math.random()),
        name:        s.name || s.title || "Unnamed scenario",
        description: s.description || "",
        type:        s.type || s.category || "",
        status:      s.status || "",
        tags:        s.tags || [],
      }));

      const result = rawJobs.map(job => {
        const jText = [job.name, job.description, job.target, job.objective, job.tags.join(" ")].join(" ");
        const matches = rawScens
          .map(sc => {
            const sText = [sc.name, sc.description, sc.type, sc.tags.join(" ")].join(" ");
            const sc2   = scoreMatch(jText, sText);
            return sc2 > 0 ? { ...sc, score: sc2 } : null;
          })
          .filter(Boolean)
          .sort((a, b) => b.score - a.score);
        return { ...job, planned: matches.length > 0, matches };
      });

      setJobs(rawJobs);
      setScenarios(rawScens);
      setCorrelated(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen(v => !v); };
    window.addEventListener("jarvis:sjsi-toggle", handler);
    return () => window.removeEventListener("jarvis:sjsi-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    timerRef.current = setInterval(load, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, load]);

  function toggle(id) {
    setExpanded(v => ({ ...v, [id]: !v[id] }));
  }

  const unplannedCount = correlated.filter(j => !j.planned).length;

  const visible = correlated
    .filter(j => {
      if (tab === "PLANNED")   return j.planned;
      if (tab === "UNPLANNED") return !j.planned;
      return true;
    })
    .filter(j => {
      if (!search) return true;
      const s = search.toLowerCase();
      return j.name.toLowerCase().includes(s) || j.description.toLowerCase().includes(s);
    });

  async function assess() {
    setAssessing(true);
    await runAssess(correlated, setAssessed, speakRef.current);
    setAssessing(false);
  }

  function statusColor(s) {
    const st = (s || "").toLowerCase();
    if (st === "running")   return GRN;
    if (st === "completed") return CY;
    if (st === "failed")    return RED;
    if (st === "queued")    return AMB;
    return "#566878";
  }

  return (
    <>
      {/* Strip button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", left: 3360, bottom: 18, zIndex: 68,
          background: open ? `${CY}22` : "rgba(8,12,22,0.85)",
          border: `1px solid ${open ? CY : "#2a3a4a"}`,
          color: open ? CY : "#566878",
          borderRadius: 6, padding: "3px 9px",
          fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
          cursor: "pointer", letterSpacing: 1,
          transition: "all 0.2s",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ◈ SJSI
        {unplannedCount > 0 && (
          <span style={{
            background: AMB, color: "#000", borderRadius: 8,
            padding: "0 5px", fontSize: 8, fontWeight: 700, minWidth: 14,
            textAlign: "center",
          }}>{unplannedCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "fixed", left: 3360, bottom: 50, zIndex: 69,
          width: 520, maxHeight: "74vh", overflow: "hidden",
          background: "rgba(8,12,22,0.94)", border: `1px solid ${CY}55`,
          borderRadius: 14, display: "flex", flexDirection: "column",
          backdropFilter: "blur(12px)", boxShadow: `0 0 60px ${CY}22`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px 10px", borderBottom: `1px solid ${CY}33`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{
              color: CY, fontWeight: 700, letterSpacing: 2, fontSize: 11,
              textShadow: `0 0 10px ${CY}`,
            }}>◈ SWARMJOB × SCENARIO INTELLIGENCE</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {loading && (
                <span style={{ color: AMB, fontSize: 9, animation: "sjsipulse 1s infinite" }}>
                  syncing…
                </span>
              )}
              <button onClick={load} style={{
                background: "none", border: `1px solid ${CY}55`, borderRadius: 4,
                color: CY, fontSize: 10, cursor: "pointer", padding: "2px 6px",
              }}>↺</button>
              <button onClick={() => setOpen(false)} style={{
                background: "none", border: "none", color: "#6E8AA0",
                fontSize: 14, cursor: "pointer", lineHeight: 1,
              }}>✕</button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${CY}22` }}>
            {[
              ["JOBS",      jobs.length,                              CY],
              ["SCENARIOS", scenarios.length,                        PRP],
              ["PLANNED",   correlated.filter(j => j.planned).length, GRN],
              ["UNPLANNED", unplannedCount,                          AMB],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{
                flex: 1, padding: "7px 4px", textAlign: "center",
                borderRight: `1px solid ${CY}18`,
              }}>
                <div style={{ color: col, fontSize: 15, fontWeight: 700 }}>{val}</div>
                <div style={{ color: "#6E8AA0", fontSize: 8, letterSpacing: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{
            padding: "6px 14px", borderBottom: `1px solid ${CY}18`,
            display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap",
          }}>
            {["ALL", "PLANNED", "UNPLANNED"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                fontSize: 8, padding: "2px 8px", borderRadius: 4,
                border: `1px solid ${tab === t ? CY : "#2a3a4a"}`,
                background: tab === t ? `${CY}22` : "transparent",
                color: tab === t ? CY : "#566878",
                cursor: "pointer", fontFamily: "inherit", letterSpacing: 1,
              }}>{t}</button>
            ))}
            <input
              type="text" placeholder="search jobs…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                flex: 1, minWidth: 80, background: `${CY}0A`, border: `1px solid ${CY}33`,
                borderRadius: 4, color: "#DCEBF5", fontSize: 9,
                padding: "3px 7px", fontFamily: "inherit", outline: "none",
              }}
            />
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px 14px" }}>
            {err && <div style={{ color: RED, fontSize: 11, padding: 8 }}>⚠ {err}</div>}
            {!loading && !err && visible.length === 0 && (
              <div style={{ color: "#6E8AA0", fontSize: 11, padding: 10 }}>No results.</div>
            )}

            {visible.map(job => {
              const col   = job.planned ? GRN : AMB;
              const isExp = expanded[job.id];
              return (
                <div key={job.id} style={{
                  marginBottom: 10,
                  background: `${col}08`,
                  border: `1px solid ${col}33`,
                  borderRadius: 8, padding: "10px 12px",
                }}>
                  <div
                    onClick={() => toggle(job.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <span style={{
                      fontSize: 8, color: col, border: `1px solid ${col}55`,
                      borderRadius: 3, padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                    }}>{job.planned ? "PLANNED" : "UNPLANNED"}</span>
                    <span style={{
                      flex: 1, color: "#DCEBF5", fontSize: 11, fontWeight: 600,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{job.name}</span>
                    {job.status && job.status !== "unknown" && (
                      <span style={{
                        fontSize: 8, color: statusColor(job.status),
                        border: `1px solid ${statusColor(job.status)}44`,
                        borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                      }}>{job.status.toUpperCase()}</span>
                    )}
                    <span style={{ color: col, fontSize: 10, flexShrink: 0 }}>
                      {job.matches.length} scen{job.matches.length !== 1 ? "s" : ""}
                    </span>
                    <span style={{ color: "#566878", fontSize: 10, flexShrink: 0 }}>
                      {isExp ? "▲" : "▼"}
                    </span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8 }}>
                      {job.description && (
                        <div style={{
                          color: "#8BAABF", fontSize: 9, marginBottom: 6,
                          lineHeight: 1.5,
                        }}>{job.description.slice(0, 200)}</div>
                      )}
                      {job.matches.length === 0 ? (
                        <div style={{ color: "#566878", fontSize: 10, fontStyle: "italic" }}>
                          No correlated scenarios — job is operating without a scenario plan.
                        </div>
                      ) : job.matches.map(sc => (
                        <div key={sc.id} style={{
                          marginTop: 6, padding: "7px 10px",
                          background: `${CY}0A`, border: `1px solid ${CY}22`,
                          borderRadius: 6,
                        }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 6, marginBottom: 4,
                          }}>
                            {sc.type && (
                              <span style={{
                                fontSize: 8, color: PRP,
                                border: "1px solid #B485FF44",
                                borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                              }}>{sc.type.toUpperCase()}</span>
                            )}
                            {sc.status && (
                              <span style={{
                                fontSize: 8, color: CY,
                                border: `1px solid ${CY}44`,
                                borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                              }}>{sc.status.toUpperCase()}</span>
                            )}
                            <span style={{
                              flex: 1, color: "#DCEBF5", fontSize: 10, fontWeight: 600,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{sc.name}</span>
                            <span style={{ color: GRN, fontSize: 9, flexShrink: 0 }}>
                              {(sc.score * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div style={{ height: 3, background: "#1A2530", borderRadius: 2 }}>
                            <div style={{
                              height: 3, borderRadius: 2,
                              width: `${Math.min(100, sc.score * 100)}%`,
                              background: GRN, boxShadow: `0 0 6px ${GRN}`,
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}18`,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 8, color: "#566878" }}>
                Source: /entities/SwarmJob + /v1/scenario/list
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ color: loading ? AMB : GRN, fontSize: 8 }}>
                  {loading ? "◌ syncing" : `${jobs.length} jobs · ${scenarios.length} scenarios`}
                </span>
                <button
                  onClick={assess}
                  disabled={assessing}
                  style={{
                    fontSize: 9, padding: "3px 9px", borderRadius: 4,
                    border: `1px solid ${CY}66`,
                    background: assessing ? `${CY}22` : "transparent",
                    color: assessing ? AMB : CY,
                    cursor: assessing ? "default" : "pointer",
                    fontFamily: "inherit", letterSpacing: 1,
                  }}>
                  {assessing ? "◌ ASSESSING…" : "▶ ASSESS"}
                </button>
              </div>
            </div>
            {assessed && (
              <div style={{
                fontSize: 10, color: "#DCEBF5", background: `${CY}0A`,
                border: `1px solid ${CY}33`, borderRadius: 6, padding: "8px 10px",
                maxHeight: 90, overflowY: "auto", lineHeight: 1.6,
              }}>{assessed}</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes sjsipulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </>
  );
}
