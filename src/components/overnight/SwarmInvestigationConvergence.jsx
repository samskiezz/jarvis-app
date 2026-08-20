/**
 * SwarmInvestigationConvergence — F41 (overnight backlog)
 *
 * Parallel-fetches /entities/SwarmJob + /v1/investigations every 90 s.
 * Keyword-correlates each swarm job against open investigations to classify:
 *   LINKED      — job directly driving an investigation (≥3 keyword hits)
 *   PARALLEL    — partial overlap, likely related (1–2 keyword hits)
 *   INDEPENDENT — no investigation linkage found
 *
 * Toggle:  ⬡ SWRINV  at right:244 bottom:8 zIndex:586
 * Event:   jarvis:swrinv-toggle
 * Voice:   "swarm investigation / swarm convergence / swrinv / job investigation"
 * Refresh: 90 s while open.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const ACC  = "#22D3EE";   /* cyan accent */
const DIM  = "#0B1420";
const POLL = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── exported helpers for JarvisBrain ─────────────────────────────────────── */

export function isSwrinvQuery(q) {
  return /\b(swarm[\s_-]*invest(igation)?|swarm[\s_-]*convergence|swrinv|job[\s_-]*invest(igation)?|swarm[\s_-]*case|swarm[\s_-]*link|show[\s_-]*swarm[\s_-]*invest)\b/i.test(
    q || ""
  );
}

export async function buildSwrinvScript() {
  try {
    const [jr, ir] = await Promise.all([
      fetch(`${apiBase()}/entities/SwarmJob`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/investigations`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const jobs          = norm(jr.ok ? await jr.json() : [], "swarm_jobs");
    const investigations = norm(ir.ok ? await ir.json() : [], "investigations");
    window.dispatchEvent(new CustomEvent("jarvis:swrinv-toggle"));
    if (!jobs.length)
      return "No swarm jobs on record, sir. Swarm investigation convergence panel is open.";
    const linked = jobs.filter((j) => classify(j, investigations) === "LINKED").length;
    return (
      `Swarm investigation convergence online, sir. ${jobs.length} swarm job${jobs.length !== 1 ? "s" : ""} ` +
      `correlated against ${investigations.length} investigation${investigations.length !== 1 ? "s" : ""}. ` +
      `${linked} job${linked !== 1 ? "s" : ""} directly linked to open cases. Panel is open.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:swrinv-toggle"));
    return "Swarm investigation convergence panel open, sir.";
  }
}

/* ── helpers ───────────────────────────────────────────────────────────────── */

function norm(raw, hint) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [hint, "data", "items", "results", "records"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function keywords(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function classify(job, investigations) {
  const jk = keywords(job);
  let best = 0;
  for (const inv of investigations) {
    const ik = keywords(inv);
    const common = jk.filter((w) => ik.includes(w)).length;
    if (common > best) best = common;
  }
  if (best >= 3) return "LINKED";
  if (best >= 1) return "PARALLEL";
  return "INDEPENDENT";
}

function matchedInvestigations(job, investigations) {
  const jk = keywords(job);
  return investigations
    .map((inv) => {
      const ik = keywords(inv);
      const score = jk.filter((w) => ik.includes(w)).length;
      return { inv, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

const CLASS_COLOR = {
  LINKED:      "#22D3EE",
  PARALLEL:    "#F59E0B",
  INDEPENDENT: "#4E6070",
};

/* ── ASSESS helper ─────────────────────────────────────────────────────────── */

async function assessJob(job, onSpeak) {
  const prompt =
    `Summarise this swarm job and its investigation relevance in exactly 2 sentences for a senior operator. ` +
    `SwarmJob: ${JSON.stringify(job).slice(0, 600)}`;
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const j = r.ok ? await r.json() : null;
    const text = j?.response ?? j?.reply ?? j?.message ?? j?.content ?? null;
    if (text) onSpeak(text);
    return text ?? "No assessment available.";
  } catch {
    return "Assessment unavailable.";
  }
}

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text: text.slice(0, 500), voice: "onyx" }),
    });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play();
    audio.onended = () => URL.revokeObjectURL(url);
  } catch { /* TTS unavailable */ }
}

/* ── component ─────────────────────────────────────────────────────────────── */

export default function SwarmInvestigationConvergence() {
  const [open, setOpen]              = useState(false);
  const [jobs, setJobs]              = useState([]);
  const [investigations, setInvests] = useState([]);
  const [loading, setLoading]        = useState(false);
  const [err, setErr]                = useState(null);
  const [search, setSearch]          = useState("");
  const [filter, setFilter]          = useState("ALL");
  const [expanded, setExpanded]      = useState(null);
  const [assessing, setAssessing]    = useState(null);
  const [assessText, setAssessText]  = useState({});
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    try {
      const [jr, ir] = await Promise.all([
        fetch(`${apiBase()}/entities/SwarmJob`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/v1/investigations`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      setJobs(norm(jr.ok ? await jr.json() : [], "swarm_jobs"));
      setInvests(norm(ir.ok ? await ir.json() : [], "investigations"));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetchData();
    timerRef.current = setInterval(fetchData, POLL);
    return () => clearInterval(timerRef.current);
  }, [open, fetchData]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:swrinv-toggle", toggle);
    return () => window.removeEventListener("jarvis:swrinv-toggle", toggle);
  }, []);

  const handleAssess = async (job) => {
    const key = job.id ?? job.job_id ?? JSON.stringify(job).slice(0, 40);
    setAssessing(key);
    const text = await assessJob(job, tts);
    setAssessText((prev) => ({ ...prev, [String(key)]: text }));
    setAssessing(null);
  };

  const classified = jobs.map((j) => ({
    job:     j,
    status:  classify(j, investigations),
    matches: matchedInvestigations(j, investigations),
  }));

  const filtered = classified.filter(({ job, status }) => {
    if (filter !== "ALL" && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!JSON.stringify(job).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    LINKED:      classified.filter((c) => c.status === "LINKED").length,
    PARALLEL:    classified.filter((c) => c.status === "PARALLEL").length,
    INDEPENDENT: classified.filter((c) => c.status === "INDEPENDENT").length,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Swarm Investigation Convergence"
        style={{
          position: "fixed", bottom: 8, right: 244, zIndex: 586,
          fontFamily: "monospace", fontSize: 10, letterSpacing: 1,
          background: `${DIM}CC`, border: `1px solid ${ACC}44`,
          color: ACC, borderRadius: 4, padding: "3px 7px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ⬡ SWRINV
        {counts.LINKED > 0 && (
          <span style={{
            background: ACC, color: "#04060A", borderRadius: "50%",
            fontSize: 8, padding: "1px 4px", minWidth: 14, textAlign: "center",
            fontWeight: 700,
          }}>
            {counts.LINKED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 24, zIndex: 586,
      width: 500, maxHeight: "72vh",
      background: `${DIM}F2`, border: `1px solid ${ACC}33`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", fontSize: 12, color: "#C0D0E0",
      boxShadow: `0 0 32px ${ACC}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${ACC}22`,
      }}>
        <span style={{ color: ACC, letterSpacing: 2, fontSize: 11, fontWeight: 700 }}>
          ⬡ SWARM INVESTIGATION CONVERGENCE
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {loading && <span style={{ fontSize: 9, color: "#4E6070" }}>SYNCING…</span>}
          <button
            onClick={() => setOpen(false)}
            style={{ background: "none", border: "none", color: "#4E6070", cursor: "pointer", fontSize: 16 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: `1px solid ${ACC}18` }}>
        {[["LINKED", ACC], ["PARALLEL", "#F59E0B"], ["INDEPENDENT", "#4E6070"]].map(([label, c]) => (
          <div key={label} style={{
            flex: 1, textAlign: "center",
            background: `${c}11`, border: `1px solid ${c}33`, borderRadius: 6, padding: "4px 0",
          }}>
            <div style={{ color: c, fontSize: 14, fontWeight: 700 }}>{counts[label]}</div>
            <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>{label}</div>
          </div>
        ))}
        <div style={{
          flex: 1, textAlign: "center",
          background: `${ACC}11`, border: `1px solid ${ACC}33`, borderRadius: 6, padding: "4px 0",
        }}>
          <div style={{ color: ACC, fontSize: 14, fontWeight: 700 }}>{investigations.length}</div>
          <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>CASES</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", gap: 6, padding: "6px 14px",
        borderBottom: `1px solid ${ACC}18`, alignItems: "center",
      }}>
        {["ALL", "LINKED", "PARALLEL", "INDEPENDENT"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
            background: filter === f ? `${ACC}22` : "none",
            border: `1px solid ${filter === f ? ACC : "#1E2E40"}`,
            color: filter === f ? ACC : "#4E6070",
            borderRadius: 4, padding: "2px 6px", cursor: "pointer",
          }}>{f}</button>
        ))}
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#0D1826", border: `1px solid ${ACC}33`,
            borderRadius: 4, color: "#C0D0E0", fontFamily: "monospace",
            fontSize: 10, padding: "2px 8px", outline: "none", width: 100,
          }}
        />
      </div>

      {/* job list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {err && (
          <div style={{ color: "#EF4444", fontSize: 10, padding: 8 }}>Error: {err}</div>
        )}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#4E6070", fontSize: 10, padding: 8 }}>
            No swarm jobs match the current filter.
          </div>
        )}
        {filtered.map(({ job, status, matches }, i) => {
          const key  = job.id ?? job.job_id ?? i;
          const sKey = String(key);
          const name = job.name ?? job.title ?? job.job_type ?? job.type ?? `Job ${i + 1}`;
          const state = job.status ?? job.state ?? job.progress ?? null;
          const statusColor = CLASS_COLOR[status];
          const isExp = expanded === key;
          return (
            <div
              key={key}
              style={{
                marginBottom: 6,
                borderLeft: `3px solid ${statusColor}66`,
                background: isExp ? `${statusColor}08` : "transparent",
                borderRadius: "0 6px 6px 0", padding: "6px 8px",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(isExp ? null : key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: statusColor, flexShrink: 0,
                  boxShadow: status === "LINKED" ? `0 0 6px ${statusColor}` : "none",
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{name}</span>
                {state && <span style={{ color: "#4E6070", fontSize: 9 }}>{state}</span>}
                <span style={{
                  fontFamily: "monospace", fontSize: 9, color: statusColor,
                  border: `1px solid ${statusColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                {matches.length > 0 && (
                  <span style={{ color: "#4E6070", fontSize: 9 }}>
                    {matches.length} case{matches.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {matches.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED INVESTIGATIONS
                      </div>
                      {matches.map(({ inv, score }) => {
                        const iTitle = inv.title ?? inv.name ?? inv.case_id ?? JSON.stringify(inv).slice(0, 50);
                        return (
                          <div key={iTitle} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: 10, color: "#8090A0", marginBottom: 3,
                            padding: "2px 6px", background: "#0D1826", borderRadius: 4,
                          }}>
                            <span>{iTitle}</span>
                            <span style={{ color: ACC, fontSize: 9 }}>score {score}</span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div style={{ color: "#3E5060", fontSize: 10, marginBottom: 4 }}>
                      No matched investigations.
                    </div>
                  )}

                  {/* ASSESS */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleAssess(job); }}
                    disabled={assessing === sKey}
                    style={{
                      fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
                      background: `${ACC}18`, border: `1px solid ${ACC}44`,
                      color: ACC, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === sKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === sKey ? "ASSESSING…" : "▶ ASSESS"}
                  </button>

                  {assessText[sKey] && (
                    <div style={{
                      marginTop: 6, padding: "6px 8px",
                      background: `${ACC}0A`, border: `1px solid ${ACC}22`,
                      borderRadius: 4, color: "#A0C0D0", fontSize: 10, lineHeight: 1.5,
                    }}>
                      {assessText[sKey]}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* footer */}
      <div style={{
        padding: "6px 14px", borderTop: `1px solid ${ACC}18`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ color: "#2E4060", fontSize: 9, letterSpacing: 1 }}>
          {filtered.length}/{jobs.length} JOBS · AUTO-REFRESH 90s
        </span>
        <button
          onClick={fetchData}
          style={{
            fontFamily: "monospace", fontSize: 9, letterSpacing: 1,
            background: "none", border: `1px solid ${ACC}33`,
            color: ACC, borderRadius: 3, padding: "2px 7px", cursor: "pointer",
          }}
        >
          ↻ SYNC
        </button>
      </div>
    </div>
  );
}
