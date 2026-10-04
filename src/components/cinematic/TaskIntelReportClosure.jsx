import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";
import { getActiveVoice } from "@/components/cinematic/MultiVoiceToggle";

const AM = "#FFB300"; const CY = "#00E5FF"; const OR = "#FF9800";
const PU = "#CE93D8"; const RD = "#FF3D3D"; const GN = "#4CAF50";
const DIM = "rgba(255,255,255,0.04)"; const BG = "rgba(6,10,18,0.94)";
const MN = "'JetBrains Mono','SF Mono',ui-monospace,monospace";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_JARVIS_API_KEY) ||
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

const REFRESH_MS = 90_000;
const BTN_LEFT   = 1100080;
const Z_IDX      = 680;

/* ── normalizers ─────────────────────────────────────────────────────────── */
function normTasks(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.tasks ?? raw.data ?? raw.items ?? []);
  return arr.map((t, i) => ({
    id:     String(t.id     ?? t.task_id ?? i),
    name:   String(t.name   ?? t.title   ?? t.subject ?? `Task-${i}`),
    status: String(t.status ?? t.state   ?? ""),
    tags:   Array.isArray(t.tags) ? t.tags.map(String) : [],
    desc:   String(t.description ?? t.desc ?? t.body ?? ""),
  }));
}

function normProfiles(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.profiles ?? raw.data ?? raw.items ?? []);
  return arr.map((p, i) => ({
    id:   String(p.id  ?? p.profile_id ?? i),
    name: String(p.name ?? p.title     ?? p.actor ?? `Profile-${i}`),
    org:  String(p.org  ?? p.organisation ?? p.affiliation ?? ""),
    role: String(p.role ?? p.type          ?? ""),
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    desc: String(p.description ?? p.desc ?? p.summary ?? ""),
  }));
}

function normReports(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : (raw.reports ?? raw.data ?? raw.items ?? []);
  return arr.map((r, i) => ({
    id:   String(r.id   ?? r.report_id ?? i),
    name: String(r.name ?? r.title     ?? `Report-${i}`),
    type: String(r.type ?? r.category  ?? r.report_type ?? ""),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    desc: String(r.description ?? r.desc ?? r.summary ?? ""),
  }));
}

/* ── token overlap ───────────────────────────────────────────────────────── */
function tokens(str) {
  return (str || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
}

function overlap(toks, obj) {
  const objToks = tokens(obj.name + " " + (obj.desc || "") + " " + (obj.tags || []).join(" "));
  return toks.filter(t => objToks.includes(t)).length;
}

/* ── classification ──────────────────────────────────────────────────────── */
function classify(task, profiles, reports) {
  const tt = tokens(task.name + " " + task.desc + " " + task.tags.join(" "));
  const hasProfile = profiles.some(p => overlap(tt, p) >= 1);
  const hasReport  = reports.some(r => overlap(tt, r) >= 1);
  if (hasProfile && hasReport) return "FULLY_CLOSED";
  if (hasReport)               return "REPORTED_ONLY";
  if (hasProfile)              return "PROFILED_ONLY";
  return "OPEN_LOOP";
}

function matchProfiles(task, profiles) {
  const tt = tokens(task.name + " " + task.desc + " " + task.tags.join(" "));
  return profiles.filter(p => overlap(tt, p) >= 1).slice(0, 4);
}

function matchReports(task, reports) {
  const tt = tokens(task.name + " " + task.desc + " " + task.tags.join(" "));
  return reports.filter(r => overlap(tt, r) >= 1).slice(0, 4);
}

/* ── voice query ─────────────────────────────────────────────────────────── */
const TIPREX_RE = /\b(tiprex|task intel closure|task report closure|intel closure review|task closure intelligence|open loop intel|task intelligence closure)\b/i;
export function isTiprexQuery(t) { return TIPREX_RE.test(t || ""); }

export async function buildTiprexScript() {
  const base = apiBase();
  const hdr  = { "Content-Type": "application/json", "x-api-key": API_KEY };
  try {
    const [tr, pr, rr] = await Promise.allSettled([
      fetch(`${base}/entities/Task`,          { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/entities/IntelProfile`,  { headers: hdr }).then(r => r.ok ? r.json() : null),
      fetch(`${base}/v1/reports`,             { headers: hdr }).then(r => r.ok ? r.json() : null),
    ]);
    const tasks    = normTasks(tr.value);
    const profiles = normProfiles(pr.value);
    const reports  = normReports(rr.value);
    const counts = { FULLY_CLOSED: 0, REPORTED_ONLY: 0, PROFILED_ONLY: 0, OPEN_LOOP: 0 };
    tasks.forEach(t => counts[classify(t, profiles, reports)]++);
    const closPct = tasks.length ? Math.round((counts.FULLY_CLOSED / tasks.length) * 100) : 0;
    return `Task Intelligence Closure Review. ${tasks.length} tasks correlated against ${profiles.length} intel profiles and ${reports.length} intelligence reports. Closure: ${counts.FULLY_CLOSED} fully closed, ${counts.REPORTED_ONLY} reported only, ${counts.PROFILED_ONLY} profiled only, ${counts.OPEN_LOOP} open loop. Overall closure rate: ${closPct} percent.`;
  } catch {
    return "TIPREX data currently unavailable.";
  }
}

/* ── component ───────────────────────────────────────────────────────────── */
export default function TaskIntelReportClosure() {
  const [open,       setOpen]       = useState(false);
  const [tasks,      setTasks]      = useState([]);
  const [profiles,   setProfiles]   = useState([]);
  const [reports,    setReports]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [filter,     setFilter]     = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expand,     setExpand]     = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    const base = apiBase();
    const hdr  = { "Content-Type": "application/json", "x-api-key": API_KEY };
    try {
      const [tr, pr, rr] = await Promise.allSettled([
        fetch(`${base}/entities/Task`,         { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }).then(r => r.ok ? r.json() : null),
        fetch(`${base}/v1/reports`,            { headers: hdr }).then(r => r.ok ? r.json() : null),
      ]);
      setTasks(normTasks(tr.value));
      setProfiles(normProfiles(pr.value));
      setReports(normReports(rr.value));
    } catch (e) {
      setErr(e.message);
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
    const handler = () => setOpen(p => !p);
    window.addEventListener("jarvis:tiprex-toggle", handler);
    return () => window.removeEventListener("jarvis:tiprex-toggle", handler);
  }, []);

  const classified = tasks.map(t => ({
    ...t,
    status:          classify(t, profiles, reports),
    matchedProfiles: matchProfiles(t, profiles),
    matchedReports:  matchReports(t, reports),
  }));

  const counts = { FULLY_CLOSED: 0, REPORTED_ONLY: 0, PROFILED_ONLY: 0, OPEN_LOOP: 0 };
  classified.forEach(t => counts[t.status]++);
  const closPct = classified.length ? Math.round((counts.FULLY_CLOSED / classified.length) * 100) : 0;

  const filtered = classified
    .filter(t => filter === "ALL" || t.status === filter)
    .filter(t => !search || t.name.toLowerCase().includes(search.toLowerCase()));

  const assess = async () => {
    setAssessing(true);
    try {
      const prompt = await buildTiprexScript();
      const base   = apiBase();
      const hdr    = { "Content-Type": "application/json", "x-api-key": API_KEY };
      const resp   = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ message: prompt }),
      });
      const data = resp.ok ? await resp.json() : null;
      const text = data?.response ?? data?.message ?? data?.content ?? prompt;
      const tts  = await fetch(`${base}/v1/voice/tts`, {
        method: "POST", headers: hdr,
        body: JSON.stringify({ text, voice: getActiveVoice() }),
      });
      if (tts.ok) {
        const blob  = await tts.blob();
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        audio.play();
      }
    } catch (_) { /* silent */ }
    finally { setAssessing(false); }
  };

  const STATUS_COLOR = { FULLY_CLOSED: GN, REPORTED_ONLY: PU, PROFILED_ONLY: CY, OPEN_LOOP: AM };
  const STATUS_LABEL = { FULLY_CLOSED: "FULLY CLOSED", REPORTED_ONLY: "REPORTED ONLY", PROFILED_ONLY: "PROFILED ONLY", OPEN_LOOP: "OPEN LOOP" };

  const panelLeft = Math.min(BTN_LEFT, (typeof window !== "undefined" ? window.innerWidth : 1920) - 480);

  return (
    <>
      <style>{`
        @keyframes tiprexPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,179,0,.55); }
          50%      { box-shadow: 0 0 0 6px rgba(255,179,0,0); }
        }
        @keyframes tiprexLoop {
          0%,100% { box-shadow: 0 0 0 0 rgba(255,61,61,.5); }
          50%      { box-shadow: 0 0 0 5px rgba(255,61,61,0); }
        }
      `}</style>

      {/* launcher button */}
      <button
        onClick={() => setOpen(p => !p)}
        title="Task × IntelProfile × Report Intelligence Closure Review"
        style={{
          position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: Z_IDX,
          background: open ? AM : "rgba(255,179,0,0.12)",
          border: `1px solid ${AM}`, borderRadius: 6, padding: "4px 10px",
          color: open ? "#000" : AM, fontFamily: MN, fontSize: 10, fontWeight: 700,
          cursor: "pointer", letterSpacing: ".06em",
          animation: open ? "none" : "tiprexPulse 2.4s infinite",
          transition: "background .2s, color .2s",
          whiteSpace: "nowrap",
        }}
      >
        TIPREX {counts.OPEN_LOOP > 0 && (
          <span style={{ background: RD, color: "#fff", borderRadius: 4, padding: "1px 5px", marginLeft: 4 }}>
            {counts.OPEN_LOOP}
          </span>
        )}
      </button>

      {/* floating panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 52, left: panelLeft, zIndex: Z_IDX,
          width: 470, maxHeight: "78vh",
          background: BG, border: `1px solid ${AM}`,
          borderRadius: 10, overflow: "hidden",
          display: "flex", flexDirection: "column",
          fontFamily: MN, fontSize: 11, color: "#e8eaf6",
          boxShadow: `0 0 28px rgba(255,179,0,.18)`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid rgba(255,179,0,.18)`,
            background: "rgba(255,179,0,.06)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: AM, fontWeight: 700, fontSize: 12, letterSpacing: ".07em" }}>
                ◈ TIPREX
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {loading && <span style={{ color: AM, fontSize: 10 }}>⟳</span>}
                <button onClick={assess} disabled={assessing} style={{
                  background: assessing ? "rgba(255,179,0,.2)" : "rgba(255,179,0,.12)",
                  border: `1px solid ${AM}`, borderRadius: 4, padding: "2px 8px",
                  color: AM, fontFamily: MN, fontSize: 10, cursor: "pointer",
                }}>
                  {assessing ? "..." : "▶ ASSESS"}
                </button>
                <button onClick={() => setOpen(false)} style={{
                  background: "none", border: "none", color: "#888",
                  cursor: "pointer", fontSize: 14, lineHeight: 1,
                }}>✕</button>
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#90a4ae", marginTop: 3 }}>
              Task × IntelProfile × Report Intelligence Closure Review — 90 s auto-refresh
            </div>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", borderBottom: `1px solid rgba(255,179,0,.1)` }}>
            {[
              ["TASKS",    tasks.length,    AM],
              ["PROFILES", profiles.length, OR],
              ["REPORTS",  reports.length,  PU],
              ["CLOSURE",  `${closPct}%`,   closPct >= 60 ? GN : closPct >= 30 ? AM : RD],
            ].map(([lbl, val, col]) => (
              <div key={lbl} style={{
                flex: 1, background: DIM, borderRadius: 6, padding: "5px 8px",
                border: `1px solid rgba(255,255,255,.06)`, textAlign: "center",
              }}>
                <div style={{ color: col, fontWeight: 700, fontSize: 13 }}>{val}</div>
                <div style={{ color: "#607d8b", fontSize: 9, marginTop: 1 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* class tiles */}
          <div style={{ display: "flex", gap: 6, padding: "6px 12px", borderBottom: `1px solid rgba(255,179,0,.1)` }}>
            {Object.entries(counts).map(([k, v]) => (
              <div key={k} style={{
                flex: 1, background: DIM, borderRadius: 6, padding: "4px 6px",
                border: `1px solid rgba(255,255,255,.06)`, textAlign: "center",
              }}>
                <div style={{ color: STATUS_COLOR[k], fontWeight: 700, fontSize: 12 }}>{v}</div>
                <div style={{ color: "#607d8b", fontSize: 8, marginTop: 1 }}>{STATUS_LABEL[k]}</div>
              </div>
            ))}
          </div>

          {/* filter tabs + search */}
          <div style={{ display: "flex", gap: 4, padding: "6px 12px 4px", flexWrap: "wrap", borderBottom: `1px solid rgba(255,179,0,.1)` }}>
            {["ALL", "FULLY_CLOSED", "REPORTED_ONLY", "PROFILED_ONLY", "OPEN_LOOP"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{
                background: filter === f ? AM : "rgba(255,255,255,.04)",
                border: `1px solid ${filter === f ? AM : "rgba(255,255,255,.1)"}`,
                borderRadius: 4, padding: "2px 7px",
                color: filter === f ? "#000" : "#90a4ae",
                fontFamily: MN, fontSize: 9, cursor: "pointer",
              }}>{f === "ALL" ? "ALL" : STATUS_LABEL[f]}</button>
            ))}
            <input
              placeholder="search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                marginLeft: "auto", background: "rgba(255,255,255,.04)",
                border: "1px solid rgba(255,255,255,.1)", borderRadius: 4,
                padding: "2px 7px", color: "#e8eaf6", fontFamily: MN, fontSize: 10,
                outline: "none", width: 110,
              }}
            />
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 10px" }}>
            {err && <div style={{ color: RD, padding: "6px 4px", fontSize: 10 }}>Error: {err}</div>}
            {!loading && !err && filtered.length === 0 && (
              <div style={{ color: "#607d8b", textAlign: "center", padding: 16, fontSize: 10 }}>No tasks match.</div>
            )}
            {filtered.map(t => (
              <div key={t.id} style={{
                marginBottom: 6, borderRadius: 7,
                border: `1px solid ${t.status === "OPEN_LOOP" ? "rgba(255,61,61,.35)" : "rgba(255,255,255,.07)"}`,
                background: DIM, overflow: "hidden",
                animation: t.status === "OPEN_LOOP" ? "tiprexLoop 2.2s infinite" : "none",
              }}>
                {/* task row */}
                <div
                  onClick={() => setExpand(expand === t.id ? null : t.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer" }}
                >
                  <span style={{
                    background: STATUS_COLOR[t.status], color: "#000",
                    borderRadius: 3, padding: "1px 5px", fontSize: 9, fontWeight: 700,
                    flexShrink: 0, minWidth: 82, textAlign: "center",
                  }}>{STATUS_LABEL[t.status]}</span>
                  <span style={{ flex: 1, color: "#e8eaf6", fontWeight: 600, fontSize: 11 }}>{t.name}</span>
                  {t.status && (
                    <span style={{ color: "#607d8b", fontSize: 9 }}>{t.status.slice(0, 8)}</span>
                  )}
                  <span style={{ color: "#607d8b", fontSize: 10 }}>{expand === t.id ? "▲" : "▼"}</span>
                </div>

                {/* expanded detail */}
                {expand === t.id && (
                  <div style={{ padding: "0 10px 8px", borderTop: "1px solid rgba(255,255,255,.06)" }}>
                    {/* matched intel profiles */}
                    {t.matchedProfiles.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ color: OR, fontSize: 9, marginBottom: 3, fontWeight: 700 }}>
                          ▸ MATCHED INTEL PROFILES ({t.matchedProfiles.length})
                        </div>
                        {t.matchedProfiles.map((p, idx) => {
                          const rel = Math.min(100, Math.max(20, overlap(
                            tokens(t.name + " " + t.desc + " " + t.tags.join(" ")), p
                          ) * 25));
                          return (
                            <div key={idx} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              marginBottom: 4, padding: "3px 6px",
                              background: "rgba(255,152,0,.07)", borderRadius: 4,
                            }}>
                              {p.org && (
                                <span style={{
                                  background: "rgba(255,152,0,.2)", color: OR,
                                  borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 700,
                                }}>{p.org.slice(0, 10).toUpperCase()}</span>
                              )}
                              <span style={{ flex: 1, color: "#ffe0b2", fontSize: 10 }}>{p.name}</span>
                              <div style={{ width: 40, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: OR, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: OR, fontSize: 9, minWidth: 28, textAlign: "right" }}>{rel}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* matched reports */}
                    {t.matchedReports.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div style={{ color: PU, fontSize: 9, marginBottom: 3, fontWeight: 700 }}>
                          ▸ MATCHED REPORTS ({t.matchedReports.length})
                        </div>
                        {t.matchedReports.map((r, idx) => {
                          const rel = Math.min(100, Math.max(20, overlap(
                            tokens(t.name + " " + t.desc + " " + t.tags.join(" ")), r
                          ) * 25));
                          return (
                            <div key={idx} style={{
                              display: "flex", alignItems: "center", gap: 6,
                              marginBottom: 4, padding: "3px 6px",
                              background: "rgba(206,147,216,.07)", borderRadius: 4,
                            }}>
                              {r.type && (
                                <span style={{
                                  background: "rgba(206,147,216,.2)", color: PU,
                                  borderRadius: 3, padding: "1px 5px", fontSize: 8, fontWeight: 700,
                                }}>{r.type.slice(0, 10).toUpperCase()}</span>
                              )}
                              <span style={{ flex: 1, color: "#e1bee7", fontSize: 10 }}>{r.name}</span>
                              <div style={{ width: 40, height: 4, background: "rgba(255,255,255,.1)", borderRadius: 2 }}>
                                <div style={{ width: `${rel}%`, height: "100%", background: PU, borderRadius: 2 }} />
                              </div>
                              <span style={{ color: PU, fontSize: 9, minWidth: 28, textAlign: "right" }}>{rel}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {t.matchedProfiles.length === 0 && t.matchedReports.length === 0 && (
                      <div style={{ color: "#607d8b", fontSize: 10, paddingTop: 6 }}>
                        No intel profile or report match found for this task.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* footer */}
          <div style={{
            padding: "5px 12px", borderTop: `1px solid rgba(255,179,0,.12)`,
            background: "rgba(255,179,0,.03)", display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ color: "#607d8b", fontSize: 9 }}>
              {filtered.length}/{classified.length} tasks · auto-refresh 90 s
            </span>
            <button onClick={load} style={{
              background: "none", border: "none", color: AM,
              fontFamily: MN, fontSize: 9, cursor: "pointer",
            }}>↺ refresh</button>
          </div>
        </div>
      )}
    </>
  );
}
