/**
 * IntelProfileTasking — F74 (overnight backlog)
 *
 * Data sources (confirmed-real endpoints):
 *   GET /entities/IntelProfile  → active threat intel profiles
 *   GET /entities/Task          → open tasks
 *
 * For each IntelProfile, keyword-correlates against all open tasks to classify:
 *   TASKED     — profile matches ≥1 task (≥2 keyword hits)
 *   AUTONOMOUS — no matching task found (no threat-actor driver)
 *
 * Displays:
 *   - Stat tiles: total profiles / tasks / tasked / autonomous
 *   - ALL / TASKED / AUTONOMOUS filter tabs + text search
 *   - Per-profile row: status dot + name + classification badge; expand → matched task cards
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence threat-tasking brief + TTS
 *
 * Toggle:  ◈ IPTASK  at bottom: 8, left: 20760, zIndex: 78
 * Event:   jarvis:iptask-toggle
 * Voice:   "intel task" / "iptask" / "threat actor tasks" / "tasked threats" / "who drives tasks"
 *          / "threat tasking" / "intel profile task" / "actor task"
 * Refresh: 90 s while open.
 *
 * Exports isIptaskQuery / buildIptaskScript for JarvisBrain.
 * Mounted in src/App.jsx.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const ACC  = "#22D3EE";
const AM   = "#F59E0B";
const RED  = "#EF4444";
const DIM  = "#0B1420";
const POLL = 90_000;
const MONO = "'JetBrains Mono','Courier New',monospace";
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

/* ── keyword helpers ───────────────────────────────────────────────────────── */

function kw(obj) {
  return JSON.stringify(obj)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function classify(profile, tasks) {
  const pk = kw(profile);
  for (const t of tasks) {
    const tk = kw(t);
    const hits = pk.filter((w) => tk.includes(w)).length;
    if (hits >= 2) return "TASKED";
  }
  return "AUTONOMOUS";
}

function matchedTasks(profile, tasks) {
  const pk = kw(profile);
  return tasks
    .map((t) => {
      const tk = kw(t);
      const score = pk.filter((w) => tk.includes(w)).length;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function norm(raw, hint) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    for (const k of [hint, "data", "items", "results", "records", "profiles", "tasks"]) {
      if (Array.isArray(raw[k])) return raw[k];
    }
    for (const v of Object.values(raw)) {
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/* ── exported helpers for JarvisBrain ─────────────────────────────────────── */

export function isIptaskQuery(q) {
  return /\b(intel[\s_-]*task|iptask|threat[\s_-]*actor[\s_-]*task|tasked[\s_-]*threat|who[\s_-]*drives[\s_-]*tasks|threat[\s_-]*tack?ing|intel[\s_-]*profile[\s_-]*task|actor[\s_-]*task)\b/i.test(
    q || ""
  );
}

export async function buildIptaskScript() {
  try {
    const [pr, tr] = await Promise.all([
      fetch(`${apiBase()}/entities/IntelProfile`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/entities/Task`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const profiles = norm(pr.ok ? await pr.json() : [], "profiles");
    const tasks    = norm(tr.ok ? await tr.json() : [], "tasks");
    window.dispatchEvent(new CustomEvent("jarvis:iptask-toggle"));
    if (!profiles.length)
      return "No active intel profiles on record, sir. Threat actor tasking panel is open.";
    const tasked     = profiles.filter((p) => classify(p, tasks) === "TASKED").length;
    const autonomous = profiles.filter((p) => classify(p, tasks) === "AUTONOMOUS").length;
    return (
      `Threat actor tasking analysis online, sir. ${profiles.length} intel profile${profiles.length !== 1 ? "s" : ""} ` +
      `cross-referenced against ${tasks.length} open task${tasks.length !== 1 ? "s" : ""}. ` +
      `${tasked} profile${tasked !== 1 ? "s" : ""} actively tasked; ${autonomous} autonomous. Panel is open.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:iptask-toggle"));
    return "Threat actor tasking panel open, sir.";
  }
}

/* ── TTS helper ────────────────────────────────────────────────────────────── */

async function tts(text) {
  try {
    const r = await fetch(`${apiBase()}/v1/voice/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ text: text.slice(0, 500), voice: "onyx" }),
    });
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    const a = new Audio(url);
    a.play();
    a.onended = () => URL.revokeObjectURL(url);
  } catch { /* TTS unavailable */ }
}

/* ── ASSESS helper ─────────────────────────────────────────────────────────── */

async function assessProfile(profile, tasks, onSpeak) {
  const matched = matchedTasks(profile, tasks)
    .map(({ t }) => t.title ?? t.name ?? t.task_type ?? t.id ?? "unknown")
    .join(", ");
  const prompt =
    `In exactly 2 sentences, summarise this threat intel profile's operational tasking for a senior analyst. ` +
    `Profile: ${JSON.stringify(profile).slice(0, 400)}. ` +
    (matched ? `Matched tasks: ${matched}.` : "No matching tasks found — actor is untasked.");
  try {
    const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ message: prompt }),
    });
    const j = r.ok ? await r.json() : null;
    const text = j?.response ?? j?.reply ?? j?.message ?? j?.content ?? j?.answer ?? null;
    if (text) onSpeak(text);
    return text ?? "No assessment available.";
  } catch {
    return "Assessment unavailable.";
  }
}

const CLASS_COLOR = {
  TASKED:     AM,
  AUTONOMOUS: ACC,
};

/* ── component ─────────────────────────────────────────────────────────────── */

export default function IntelProfileTasking() {
  const [open, setOpen]             = useState(false);
  const [profiles, setProfiles]     = useState([]);
  const [tasks, setTasks]           = useState([]);
  const [loading, setLoading]       = useState(false);
  const [err, setErr]               = useState(null);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState("ALL");
  const [expanded, setExpanded]     = useState(null);
  const [assessing, setAssessing]   = useState(null);
  const [assessText, setAssessText] = useState({});
  const timerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    try {
      const [pr, tr] = await Promise.all([
        fetch(`${apiBase()}/entities/IntelProfile`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
        fetch(`${apiBase()}/entities/Task`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        }),
      ]);
      setProfiles(norm(pr.ok ? await pr.json() : [], "profiles"));
      setTasks(norm(tr.ok ? await tr.json() : [], "tasks"));
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
    window.addEventListener("jarvis:iptask-toggle", toggle);
    return () => window.removeEventListener("jarvis:iptask-toggle", toggle);
  }, []);

  const handleAssess = async (profile) => {
    const key = profile.id ?? profile.profile_id ?? JSON.stringify(profile).slice(0, 40);
    setAssessing(key);
    const text = await assessProfile(profile, tasks, tts);
    setAssessText((prev) => ({ ...prev, [String(key)]: text }));
    setAssessing(null);
  };

  const classified = profiles.map((p) => ({
    profile:  p,
    status:   classify(p, tasks),
    matches:  matchedTasks(p, tasks),
  }));

  const filtered = classified.filter(({ profile, status }) => {
    if (filter !== "ALL" && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!JSON.stringify(profile).toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const counts = {
    TASKED:     classified.filter((c) => c.status === "TASKED").length,
    AUTONOMOUS: classified.filter((c) => c.status === "AUTONOMOUS").length,
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Intel Profile × Task — Threat Actor Tasking"
        style={{
          position: "fixed", bottom: 8, left: 20760, zIndex: 78,
          fontFamily: MONO, fontSize: 10, letterSpacing: 1,
          background: `${DIM}CC`, border: `1px solid ${ACC}44`,
          color: ACC, borderRadius: 4, padding: "3px 7px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ◈ IPTASK
        {counts.TASKED > 0 && (
          <span style={{
            background: AM, color: "#000", borderRadius: "50%",
            fontSize: 8, padding: "1px 4px", minWidth: 14, textAlign: "center",
            fontWeight: 700,
          }}>
            {counts.TASKED}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", bottom: 50, right: 24, zIndex: 78,
      width: 500, maxHeight: "72vh",
      background: `${DIM}F2`, border: `1px solid ${ACC}33`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: MONO, fontSize: 12, color: "#C0D0E0",
      boxShadow: `0 0 32px ${ACC}18`,
    }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: `1px solid ${ACC}22`,
      }}>
        <span style={{ color: ACC, letterSpacing: 2, fontSize: 11, fontWeight: 700 }}>
          ◈ THREAT ACTOR TASKING
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
        {[["TASKED", AM], ["AUTONOMOUS", ACC]].map(([label, c]) => (
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
          background: `${AM}11`, border: `1px solid ${AM}33`, borderRadius: 6, padding: "4px 0",
        }}>
          <div style={{ color: AM, fontSize: 14, fontWeight: 700 }}>{profiles.length}</div>
          <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>PROFILES</div>
        </div>
        <div style={{
          flex: 1, textAlign: "center",
          background: `${ACC}11`, border: `1px solid ${ACC}33`, borderRadius: 6, padding: "4px 0",
        }}>
          <div style={{ color: ACC, fontSize: 14, fontWeight: 700 }}>{tasks.length}</div>
          <div style={{ color: "#4E6070", fontSize: 8, letterSpacing: 1 }}>TASKS</div>
        </div>
      </div>

      {/* filter tabs + search */}
      <div style={{
        display: "flex", gap: 6, padding: "6px 14px",
        borderBottom: `1px solid ${ACC}18`, alignItems: "center",
      }}>
        {["ALL", "TASKED", "AUTONOMOUS"].map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
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
            borderRadius: 4, color: "#C0D0E0", fontFamily: MONO,
            fontSize: 10, padding: "2px 8px", outline: "none", width: 100,
          }}
        />
      </div>

      {/* profile list */}
      <div style={{ overflowY: "auto", flex: 1, padding: "8px 14px" }}>
        {err && (
          <div style={{ color: RED, fontSize: 10, padding: 8 }}>Error: {err}</div>
        )}
        {!err && filtered.length === 0 && !loading && (
          <div style={{ color: "#4E6070", fontSize: 10, padding: 8 }}>
            No intel profiles match the current filter.
          </div>
        )}
        {filtered.map(({ profile, status, matches }, i) => {
          const key   = profile.id ?? profile.profile_id ?? i;
          const sKey  = String(key);
          const name  = profile.name ?? profile.title ?? profile.actor ?? profile.threat_actor ?? `Profile ${i + 1}`;
          const type  = profile.threat_type ?? profile.category ?? profile.type ?? null;
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
                  boxShadow: status === "TASKED"
                    ? `0 0 6px ${statusColor}, 0 0 12px ${statusColor}66`
                    : "none",
                }} />
                <span style={{ flex: 1, color: "#D0E0F0", fontSize: 11 }}>{name}</span>
                {type && <span style={{ color: "#4E6070", fontSize: 9 }}>{type}</span>}
                <span style={{
                  fontFamily: MONO, fontSize: 9, color: statusColor,
                  border: `1px solid ${statusColor}55`, borderRadius: 3,
                  padding: "1px 5px", letterSpacing: 1, flexShrink: 0,
                }}>
                  {status}
                </span>
                {matches.length > 0 && (
                  <span style={{ color: "#4E6070", fontSize: 9 }}>
                    {matches.length} task{matches.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {isExp && (
                <div style={{ marginTop: 8, paddingLeft: 14 }}>
                  {matches.length > 0 ? (
                    <>
                      <div style={{ color: "#7090A0", fontSize: 9, marginBottom: 4, letterSpacing: 1 }}>
                        MATCHED TASKS
                      </div>
                      {matches.map(({ t, score }) => {
                        const tName   = t.title ?? t.name ?? t.task_type ?? t.id ?? JSON.stringify(t).slice(0, 50);
                        const tStatus = t.status ?? t.state ?? null;
                        const tColor  = tStatus === "done" || tStatus === "complete" ? ACC
                          : tStatus === "blocked" || tStatus === "failed" ? RED : AM;
                        return (
                          <div key={tName} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            fontSize: 10, color: "#8090A0", marginBottom: 3,
                            padding: "2px 6px", background: "#0D1826", borderRadius: 4,
                          }}>
                            <span>{tName}</span>
                            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {tStatus && (
                                <span style={{
                                  color: tColor, fontSize: 8,
                                  border: `1px solid ${tColor}44`, borderRadius: 3,
                                  padding: "1px 4px", letterSpacing: 1, textTransform: "uppercase",
                                }}>
                                  {tStatus}
                                </span>
                              )}
                              <span style={{ color: ACC, fontSize: 9 }}>score {score}</span>
                            </span>
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div style={{ color: "#3E5060", fontSize: 10, marginBottom: 4 }}>
                      No matching tasks found — actor is untasked.
                    </div>
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); handleAssess(profile); }}
                    disabled={assessing === sKey}
                    style={{
                      fontFamily: MONO, fontSize: 9, letterSpacing: 1,
                      background: `${ACC}18`, border: `1px solid ${ACC}44`,
                      color: ACC, borderRadius: 4, padding: "3px 8px",
                      cursor: assessing === sKey ? "wait" : "pointer", marginTop: 6,
                    }}
                  >
                    {assessing === sKey ? "ASSESSING…" : "▶ ASSESS TASKING"}
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
          {filtered.length}/{profiles.length} PROFILES · AUTO-REFRESH 90s
        </span>
        <button
          onClick={fetchData}
          style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: 1,
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
