/**
 * TaskIntelProfileNexus — F544 (TAINTEL)
 * "JARVIS, task intel / intel task / taintel / which tasks have intel
 *  / intel-backed tasks / task intelligence / unintelligenced tasks"
 * Cross-references /entities/Task + /entities/IntelProfile.
 * Finds TRACKED tasks (≥1 intel profile keyword-matches) vs UNTRACKED (no intel backing).
 * Coverage % tile; ALL/TRACKED/UNTRACKED filter tabs + search; click-to-expand matched profiles.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence intelligence-operations brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 47_900;
const Z_INDEX  = 114;

const TAINTEL_RE =
  /\btaintel\b|\btask.?intel(?:ligence)?\b|\bintel.?task\b|\bwhich.?tasks?.?have.?intel\b|\bintel.?backed.?tasks?\b|\btask.?intelligence\b|\bunintelligenced.?tasks?\b|\btask.?profile.?coverage\b|\bintel.?task.?coverage\b/i;

export function isTaintelQuery(text) {
  return TAINTEL_RE.test(text || "");
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function keywords(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
}

function overlap(a, b) {
  const sa = new Set(keywords(a));
  return keywords(b).filter((w) => sa.has(w)).length;
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw =
    data.tasks || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:       t.id || `task-${i}`,
    name:     t.name || t.title || t.label || `Task ${i + 1}`,
    status:   (t.status || t.state || "PENDING").toUpperCase(),
    priority: (t.priority || "").toUpperCase(),
    tags:     Array.isArray(t.tags) ? t.tags.join(" ") : String(t.tags || ""),
    notes:    t.notes || t.description || t.summary || "",
  }));
}

function normaliseProfiles(data) {
  if (!data) return [];
  const raw =
    data.profiles || data.intel_profiles || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((p, i) => ({
    id:         p.id || `prof-${i}`,
    name:       p.name || p.title || p.actor || `Profile ${i + 1}`,
    actor_type: (p.actor_type || p.type || p.category || "UNKNOWN").toUpperCase(),
    confidence: typeof p.confidence === "number" ? p.confidence : null,
    tags:       Array.isArray(p.tags) ? p.tags.join(" ") : String(p.tags || ""),
    summary:    p.summary || p.description || p.notes || "",
  }));
}

function crossRef(tasks, profiles) {
  return tasks.map((task) => {
    const haystack = `${task.name} ${task.tags} ${task.notes}`;
    const matches = profiles
      .map((p) => ({
        ...p,
        hits: overlap(haystack, `${p.name} ${p.actor_type} ${p.tags} ${p.summary}`),
      }))
      .filter((p) => p.hits > 0)
      .sort((a, b) => b.hits - a.hits);
    return { ...task, tracked: matches.length > 0, matches };
  });
}

const actorColor = (type) => {
  const map = {
    THREAT:       "#FF3B3B",
    STATE:        "#A855F7",
    CRIMINAL:     AMB,
    CORPORATE:    GRN,
    INDIVIDUAL:   CY,
  };
  for (const [k, v] of Object.entries(map)) if (type.includes(k)) return v;
  return CY;
};

// ─── exported script (JarvisBrain voice call) ────────────────────────────────

export async function buildTaintelScript() {
  const base = apiBase();
  const headers = { Authorization: `Bearer ${API_KEY}` };
  try {
    const [taskRes, profRes] = await Promise.all([
      fetch(`${base}/entities/Task`,        { headers }),
      fetch(`${base}/entities/IntelProfile`, { headers }),
    ]);
    const [taskData, profData] = await Promise.all([taskRes.json(), profRes.json()]);
    const tasks    = normaliseTasks(taskData);
    const profiles = normaliseProfiles(profData);
    const crossed  = crossRef(tasks, profiles);
    const tracked   = crossed.filter((t) => t.tracked);
    const untracked = crossed.filter((t) => !t.tracked);
    const coverage  = tasks.length > 0
      ? Math.round((tracked.length / tasks.length) * 100)
      : 0;
    return `Intelligence-task coverage: ${tracked.length} of ${tasks.length} tasks have at least one correlated intel profile (${coverage}% coverage). ${untracked.length} task${untracked.length !== 1 ? "s" : ""} lack any intel backing${untracked.length > 0 ? `, including ${untracked.slice(0, 2).map((t) => t.name).join(" and ")}` : ""}.`;
  } catch (err) {
    return `Intelligence-task coverage fetch failed: ${err.message}`;
  }
}

// ─── component ───────────────────────────────────────────────────────────────

export default function TaskIntelProfileNexus() {
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [crossed,   setCrossed]   = useState([]);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const timer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base    = apiBase();
      const headers = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, profRes] = await Promise.all([
        fetch(`${base}/entities/Task`,        { headers }),
        fetch(`${base}/entities/IntelProfile`, { headers }),
      ]);
      const [taskData, profData] = await Promise.all([taskRes.json(), profRes.json()]);
      const tasks    = normaliseTasks(taskData);
      const profiles = normaliseProfiles(profData);
      setCrossed(crossRef(tasks, profiles));
    } catch {
      // silent — stale data stays visible
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); load(); };
    window.addEventListener("jarvis:taintel-toggle", handler);
    return () => window.removeEventListener("jarvis:taintel-toggle", handler);
  }, [load]);

  const tracked   = crossed.filter((t) => t.tracked);
  const untracked = crossed.filter((t) => !t.tracked);
  const coverage  = crossed.length > 0 ? Math.round((tracked.length / crossed.length) * 100) : 0;

  const visible = crossed
    .filter((t) => tab === "ALL" || (tab === "TRACKED" ? t.tracked : !t.tracked))
    .filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.status.toLowerCase().includes(search.toLowerCase()));

  const assess = useCallback(async () => {
    if (assessing) return;
    setAssessing(true);
    setBrief("");
    try {
      const base   = apiBase();
      const prompt = `Intelligence-task coverage: ${tracked.length}/${crossed.length} tasks have intel profiles (${coverage}%). Untracked: ${untracked.slice(0, 3).map((t) => t.name).join(", ")}. Provide a 2-sentence intelligence-operations assessment of task coverage gaps.`;
      const res  = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body:    JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const text = data.response || data.message || data.content || "";
      setBrief(text);
      if (text) {
        await fetch(`${base}/v1/voice/tts`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
          body:    JSON.stringify({ text }),
        });
      }
    } catch {
      setBrief("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }, [assessing, tracked, untracked, crossed.length, coverage]);

  const btnStyle = {
    position:     "fixed",
    bottom:       8,
    left:         BTN_LEFT,
    zIndex:       Z_INDEX,
    background:   "rgba(0,10,25,0.85)",
    border:       `1px solid ${untracked.length > 0 ? AMB : CY}`,
    color:        untracked.length > 0 ? AMB : CY,
    borderRadius: 3,
    padding:      "2px 7px",
    fontSize:     9,
    fontFamily:   "monospace",
    cursor:       "pointer",
    whiteSpace:   "nowrap",
  };

  if (!open) {
    return (
      <button
        style={btnStyle}
        onClick={() => setOpen(true)}
        title="Task × Intel Profile Nexus (TAINTEL)"
      >
        ◈ TAINTEL{untracked.length > 0 && (
          <span style={{ color: AMB, marginLeft: 4 }}>{untracked.length}</span>
        )}
      </button>
    );
  }

  const panel = {
    position:     "fixed",
    bottom:       36,
    left:         Math.min(BTN_LEFT, window.innerWidth - 480),
    width:        460,
    maxHeight:    "75vh",
    overflowY:    "auto",
    zIndex:       Z_INDEX + 1,
    background:   "rgba(0,10,25,0.97)",
    border:       `1px solid ${CY}`,
    borderRadius: 6,
    fontFamily:   "monospace",
    fontSize:     11,
    color:        CY,
    padding:      14,
    boxShadow:    `0 0 24px ${CY}44`,
  };

  return (
    <>
      <button style={btnStyle} onClick={() => setOpen(false)}>
        ◈ TAINTEL ✕
      </button>

      <div style={panel}>
        <div style={{ fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>
          ◈ TASK × INTEL PROFILE NEXUS
        </div>

        {/* stat tiles */}
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {[
            ["TASKS",      crossed.length,    CY],
            ["TRACKED",    tracked.length,    GRN],
            ["UNTRACKED",  untracked.length,  AMB],
            ["COVERAGE",   `${coverage}%`,    coverage > 50 ? GRN : AMB],
          ].map(([label, val, col]) => (
            <div
              key={label}
              style={{
                flex:         1,
                background:   "rgba(255,255,255,0.04)",
                border:       `1px solid ${col}55`,
                borderRadius: 4,
                padding:      "4px 6px",
                textAlign:    "center",
              }}
            >
              <div style={{ color: col, fontSize: 14, fontWeight: "bold" }}>{val}</div>
              <div style={{ color: DIM, fontSize: 9 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {["ALL", "TRACKED", "UNTRACKED"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                background:   tab === t ? CY : "transparent",
                color:        tab === t ? "#000" : DIM,
                border:       `1px solid ${tab === t ? CY : DIM}`,
                borderRadius: 3,
                padding:      "2px 8px",
                fontSize:     10,
                cursor:       "pointer",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search tasks…"
          style={{
            width:        "100%",
            background:   "rgba(255,255,255,0.05)",
            border:       `1px solid ${DIM}`,
            borderRadius: 3,
            color:        CY,
            padding:      "3px 6px",
            fontSize:     10,
            marginBottom: 8,
            boxSizing:    "border-box",
          }}
        />

        {/* list */}
        {loading && !crossed.length ? (
          <div style={{ color: DIM, textAlign: "center", padding: 20 }}>FETCHING…</div>
        ) : visible.length === 0 ? (
          <div style={{ color: DIM, padding: 12 }}>No tasks match.</div>
        ) : (
          visible.map((task) => (
            <div
              key={task.id}
              style={{
                borderBottom: "1px solid rgba(41,231,255,0.1)",
                paddingBottom: 8,
                marginBottom:  8,
              }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              >
                <span
                  style={{
                    fontSize:     9,
                    padding:      "1px 5px",
                    borderRadius: 3,
                    background:   task.tracked ? `${GRN}22` : `${AMB}22`,
                    color:        task.tracked ? GRN : AMB,
                    border:       `1px solid ${task.tracked ? GRN : AMB}55`,
                    flexShrink:   0,
                  }}
                >
                  {task.tracked ? "TRACKED" : "UNTRACKED"}
                </span>
                <span style={{ color: task.tracked ? CY : DIM, flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.name}
                </span>
                {task.status && (
                  <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{task.status}</span>
                )}
                <span style={{ color: DIM }}>{expanded === task.id ? "▲" : "▼"}</span>
              </div>

              {expanded === task.id && (
                <div style={{ marginTop: 6, paddingLeft: 8 }}>
                  {task.priority && (
                    <div style={{ color: DIM, fontSize: 10, marginBottom: 4 }}>
                      Priority: <span style={{ color: CY }}>{task.priority}</span>
                    </div>
                  )}
                  {task.matches.length === 0 ? (
                    <div style={{ color: AMB, fontSize: 10 }}>No intel profiles correlated.</div>
                  ) : (
                    task.matches.slice(0, 5).map((p) => (
                      <div
                        key={p.id}
                        style={{
                          display:      "flex",
                          alignItems:   "flex-start",
                          gap:          6,
                          marginBottom: 4,
                          paddingLeft:  4,
                          borderLeft:   `2px solid ${GRN}55`,
                        }}
                      >
                        <span
                          style={{
                            fontSize:     8,
                            padding:      "1px 4px",
                            borderRadius: 2,
                            background:   `${actorColor(p.actor_type)}22`,
                            color:        actorColor(p.actor_type),
                            border:       `1px solid ${actorColor(p.actor_type)}44`,
                            flexShrink:   0,
                            marginTop:    1,
                          }}
                        >
                          {p.actor_type}
                        </span>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ color: CY, fontSize: 10 }}>{p.name}</div>
                          {p.confidence !== null && (
                            <div style={{ color: DIM, fontSize: 9 }}>
                              confidence: <span style={{ color: GRN }}>{Math.round(p.confidence * 100)}%</span>
                            </div>
                          )}
                        </div>
                        <span style={{ color: DIM, fontSize: 9, flexShrink: 0 }}>{p.hits}↑</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {/* assess */}
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            marginTop:    8,
            width:        "100%",
            background:   assessing ? "transparent" : `${GRN}22`,
            border:       `1px solid ${GRN}`,
            color:        GRN,
            borderRadius: 3,
            padding:      "4px 0",
            cursor:       assessing ? "not-allowed" : "pointer",
            fontSize:     10,
          }}
        >
          {assessing ? "ASSESSING…" : "▶ ASSESS"}
        </button>

        {brief && (
          <div
            style={{
              marginTop:    8,
              padding:      8,
              background:   "rgba(0,229,160,0.06)",
              border:       `1px solid ${GRN}44`,
              borderRadius: 4,
              color:        GRN,
              fontSize:     10,
              lineHeight:   1.5,
            }}
          >
            {brief}
          </div>
        )}
      </div>
    </>
  );
}
