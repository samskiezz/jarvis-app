/**
 * F72 — Intel-Profile × Task Linker
 *
 * Parallel-fetches /entities/IntelProfile and /entities/Task, then
 * keyword-correlates each tracked threat profile against the task catalog
 * to surface whether the profile is TASKED (at least one active task addresses it)
 * or UNTASKED (no task covers it — a coverage gap).
 *
 * Stat tiles: profiles / tasks / tasked / untasked.
 * Filter tabs: ALL | TASKED | UNTASKED.
 * Expand any profile → matched tasks with relevance score + status badge.
 * ▶ ASSESS: 2-sentence AI threat-coverage brief via
 *   /v1/jarvis/agent/chat + jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ IPTASK  at bottom:8 left:9332, zIndex 69.
 * Voice:   "intel task / threat task / profile task / iptask / who's handling this threat"
 * Event:   jarvis:iptask-toggle
 * Refresh: 90 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { COLORS as C, SHELL as S } from "@/domain/colors";

const BTN_LEFT = 9332;
const POLL_MS  = 90_000;
const API_KEY  = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

function apiBase() {
  const env = typeof import.meta !== "undefined" ? import.meta.env : {};
  if (env.VITE_API_BASE_URL) return env.VITE_API_BASE_URL;
  if (typeof window !== "undefined" && window.location) {
    const { protocol, hostname } = window.location;
    return `${protocol}//${hostname}:${env.VITE_API_PORT || "8001"}`;
  }
  return "http://localhost:8001";
}

// ── exported intent helpers ───────────────────────────────────────────────────

const IPTASK_RE =
  /\b(intel\s+task|threat\s+task|profile\s+task|iptask|who['']?s\s+handling\s+(this\s+)?threat|task\s+coverage\s+for\s+(intel|threat)|intel\s+profile\s+task)\b/i;

export function isIptaskQuery(q) { return IPTASK_RE.test(q); }

export async function buildIptaskScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [profRes, taskRes] = await Promise.all([
      fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
      fetch(`${base}/entities/Task`,         { headers: hdr }),
    ]);
    const profiles = normaliseProfiles(await profRes.json());
    const tasks    = normaliseTasks(await taskRes.json());

    const tasked   = profiles.filter((p) => tasks.some((t) => relevance(p, t) > 0)).length;
    const untasked = profiles.length - tasked;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS threat-task coverage: ${profiles.length} intel profiles tracked, ` +
          `${tasks.length} active tasks on file, ${tasked} profiles have at least one ` +
          `task addressing them, ${untasked} profiles have NO task coverage — a gap. ` +
          `Give a 2-sentence threat-coverage brief — formal British butler tone, first person.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Threat-task coverage analysis complete, sir.").trim();
  } catch {
    return "Threat-task coverage analysis is unavailable at this time, sir.";
  }
}

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseProfiles(raw) {
  const arr = Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.data)                      ? raw.data
    : Array.isArray(raw?.intel_profiles)            ? raw.intel_profiles
    : Array.isArray(raw?.items)                     ? raw.items
    : Array.isArray(raw?.results)                   ? raw.results
    : [];
  return arr.map((p, i) => ({
    id:       p.id         || String(i),
    name:     p.name       || p.title || p.entity_name || `Profile ${i + 1}`,
    type:     (p.type      || p.entity_type || p.profile_type || "").toLowerCase(),
    threat:   (p.threat_level || p.severity || p.risk_level || "").toLowerCase(),
    desc:     (p.description || p.summary   || p.tags || p.aliases || "").toString(),
  }));
}

function normaliseTasks(raw) {
  const arr = Array.isArray(raw)                    ? raw
    : Array.isArray(raw?.data)                      ? raw.data
    : Array.isArray(raw?.tasks)                     ? raw.tasks
    : Array.isArray(raw?.items)                     ? raw.items
    : Array.isArray(raw?.results)                   ? raw.results
    : [];
  return arr.map((t, i) => ({
    id:     t.id     || String(i),
    title:  t.title  || t.name || t.task_name || `Task ${i + 1}`,
    status: (t.status || t.state || "").toLowerCase(),
    desc:   (t.description || t.summary || t.tags || "").toString(),
  }));
}

function profileKeywords(profile) {
  return String(`${profile.name} ${profile.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function taskKeywords(task) {
  return String(`${task.title} ${task.desc}`)
    .toLowerCase()
    .split(/[\s_\-.,/|:@()"']+/)
    .filter((w) => w.length >= 3);
}

function relevance(profile, task) {
  const pw = profileKeywords(profile);
  const tw = taskKeywords(task);
  return pw.filter((w) => tw.some((s) => s.includes(w) || w.includes(s))).length;
}

function buildLinked(profiles, tasks) {
  return profiles.map((p) => {
    const matched = tasks
      .map((t) => ({ ...t, score: relevance(p, t) }))
      .filter((t) => t.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...p, tasks: matched, tasked: matched.length > 0 };
  });
}

// ── colours ───────────────────────────────────────────────────────────────────

function threatColor(lvl) {
  if (lvl === "critical" || lvl === "high") return "#EF4444";
  if (lvl === "medium")                     return "#F97316";
  if (lvl === "low")                        return "#F59E0B";
  return C.blue;
}

function statusColor(s) {
  if (s === "completed" || s === "done")     return "#4ADE80";
  if (s === "in_progress" || s === "active") return C.neon;
  if (s === "blocked")                       return "#EF4444";
  return S.text;
}

// ── component ─────────────────────────────────────────────────────────────────

const TABS = ["ALL", "TASKED", "UNTASKED"];

export default function IntelProfileTaskLinker() {
  const [open,      setOpen]      = useState(false);
  const [profiles,  setProfiles]  = useState([]);
  const [tasks,     setTasks]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [lastFetch, setLastFetch] = useState(null);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [profRes, taskRes] = await Promise.all([
        fetch(`${base}/entities/IntelProfile`, { headers: hdr }),
        fetch(`${base}/entities/Task`,         { headers: hdr }),
      ]);
      setProfiles(normaliseProfiles(await profRes.json()));
      setTasks(normaliseTasks(await taskRes.json()));
      setLastFetch(new Date());
    } catch { /* backend unreachable */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:iptask-toggle", onToggle);
    return () => window.removeEventListener("jarvis:iptask-toggle", onToggle);
  }, []);

  useEffect(() => {
    const onAsk = (e) => {
      const q = (e.detail?.text || e.detail?.query || "").toLowerCase();
      if (isIptaskQuery(q)) setOpen(true);
    };
    window.addEventListener("jarvis:ask", onAsk);
    return () => window.removeEventListener("jarvis:ask", onAsk);
  }, []);

  const linked    = buildLinked(profiles, tasks);
  const taskedCnt = linked.filter((p) => p.tasked).length;
  const untaskedCnt = linked.filter((p) => !p.tasked).length;

  const visible = linked.filter((p) => {
    if (filter === "TASKED")   return p.tasked;
    if (filter === "UNTASKED") return !p.tasked;
    return true;
  });

  async function assess() {
    setAssessing(true);
    const text = await buildIptaskScript();
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
  }

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Intel Profile × Task Linker (◈ IPTASK)"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 69,
          background: open ? "rgba(0,200,120,0.18)" : "rgba(2,6,10,0.82)",
          border: `1px solid ${open ? C.neon : S.border}`,
          borderRadius: S.radius, color: open ? C.neon : S.textHi,
          fontFamily: S.mono, fontSize: S.fs.xxs, letterSpacing: 1,
          padding: "3px 7px", cursor: "pointer",
          boxShadow: open ? `0 0 8px ${C.neon}44` : "none",
          transition: "all 0.15s",
        }}
      >
        ◈ IPTASK{untaskedCnt > 0 && (
          <span style={{
            marginLeft: 4, background: "#EF4444", color: "#fff",
            borderRadius: 8, padding: "0 4px", fontSize: 9,
          }}>{untaskedCnt}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", zIndex: 68,
          bottom: 36, left: Math.max(8, BTN_LEFT - 280),
          width: 360,
          background: S.glass, backdropFilter: S.blur, WebkitBackdropFilter: S.blur,
          border: `1px solid ${S.border}`, borderTop: `2px solid ${C.neon}`,
          borderRadius: S.radius,
          boxShadow: "0 4px 28px rgba(0,0,0,0.55)",
          fontFamily: S.mono, fontSize: S.fs.xs,
          display: "flex", flexDirection: "column",
          maxHeight: "68vh", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 12px", borderBottom: `1px solid ${S.border}`,
          }}>
            <span style={{ color: C.neon, letterSpacing: 2, fontWeight: 700 }}>
              INTEL × TASKS
            </span>
            <button
              onClick={assess}
              disabled={assessing || profiles.length === 0}
              style={{
                background: "transparent", border: `1px solid ${C.blue}`,
                color: C.blue, borderRadius: S.radius, padding: "2px 8px",
                fontFamily: S.mono, fontSize: S.fs.xxs, cursor: "pointer",
                opacity: (assessing || profiles.length === 0) ? 0.4 : 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
          </div>

          {/* Stat tiles */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)",
            gap: 6, padding: "8px 12px",
          }}>
            {[
              { label: "PROFILES", val: profiles.length,  color: C.blue    },
              { label: "TASKS",    val: tasks.length,      color: C.gold    },
              { label: "TASKED",   val: taskedCnt,         color: "#4ADE80" },
              { label: "UNTASKED", val: untaskedCnt,       color: "#EF4444" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                background: "rgba(0,0,0,0.3)", borderRadius: 6,
                padding: "5px 4px", textAlign: "center",
              }}>
                <div style={{ color, fontSize: S.fs.lg, fontWeight: 700 }}>{val}</div>
                <div style={{ color: S.text, fontSize: "8px", letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Filter tabs */}
          <div style={{ display: "flex", gap: 4, padding: "0 12px 6px" }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setFilter(t)} style={{
                flex: 1, background: filter === t ? `${C.neon}22` : "transparent",
                border: `1px solid ${filter === t ? C.neon : S.border}`,
                color: filter === t ? C.neon : S.text,
                borderRadius: S.radius, padding: "2px 0",
                fontFamily: S.mono, fontSize: "8px", letterSpacing: 1, cursor: "pointer",
              }}>{t}</button>
            ))}
          </div>

          {/* Profile list */}
          <div style={{ overflowY: "auto", flex: 1, padding: "0 12px 10px" }}>
            {loading && profiles.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>Loading…</div>
            ) : visible.length === 0 ? (
              <div style={{ color: S.text, padding: "12px 0" }}>No profiles match.</div>
            ) : visible.map((p) => (
              <div key={p.id} style={{ marginBottom: 6 }}>
                <div
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer",
                    background: "rgba(0,0,0,0.25)",
                    borderLeft: `3px solid ${p.tasked ? "#4ADE80" : "#EF4444"}`,
                  }}
                >
                  <span style={{ color: p.tasked ? "#4ADE80" : "#EF4444", fontSize: 10, width: 10 }}>
                    {p.tasked ? "●" : "○"}
                  </span>
                  <span style={{ flex: 1, color: S.textHi, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "9px" }}>
                    {p.name}
                  </span>
                  {p.threat && (
                    <span style={{
                      fontSize: "8px", padding: "1px 4px", borderRadius: 4,
                      background: `${threatColor(p.threat)}22`, color: threatColor(p.threat),
                      border: `1px solid ${threatColor(p.threat)}44`,
                      whiteSpace: "nowrap",
                    }}>
                      {p.threat}
                    </span>
                  )}
                  <span style={{ color: p.tasked ? "#4ADE80" : "#EF4444", fontSize: "9px", minWidth: 52, textAlign: "right" }}>
                    {p.tasked ? `${p.tasks.length} TSK` : "UNTASKED"}
                  </span>
                  <span style={{ color: S.text, fontSize: 9 }}>{expanded === p.id ? "▴" : "▾"}</span>
                </div>

                {expanded === p.id && (
                  <div style={{
                    margin: "2px 0 2px 18px",
                    background: "rgba(0,0,0,0.18)", borderRadius: 4,
                    padding: "5px 8px",
                  }}>
                    {p.tasked ? p.tasks.map((t) => (
                      <div key={t.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "2px 0", borderBottom: `1px solid ${S.border}33`,
                      }}>
                        <span style={{ color: S.textHi, fontSize: "9px", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {t.title}
                        </span>
                        <span style={{ fontSize: "9px", marginLeft: 6, whiteSpace: "nowrap", color: t.status ? statusColor(t.status) : S.text }}>
                          {t.status ? `${t.status} ` : ""}rel:{t.score}
                        </span>
                      </div>
                    )) : (
                      <div style={{ color: S.text, fontSize: "9px", padding: "2px 0" }}>
                        No tasks address this intel profile — coverage gap.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{
            padding: "4px 12px", borderTop: `1px solid ${S.border}`,
            color: S.text, fontSize: "8px", letterSpacing: 0.5,
          }}>
            /entities/IntelProfile · /entities/Task · {lastFetch ? lastFetch.toLocaleTimeString("en-GB") : "—"}
          </div>
        </div>
      )}
    </>
  );
}
