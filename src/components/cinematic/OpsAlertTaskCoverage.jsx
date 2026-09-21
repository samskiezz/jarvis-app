/**
 * OpsAlertTaskCoverage — F642
 * "JARVIS, oaltask / ops alert task / alert task coverage / which tasks have alerts /
 *  task alerts / flagged tasks / task alert match / alert-flagged tasks"
 * Cross-references /v1/ops/alerts against /entities/Task by keyword.
 * FLAGGED tasks (≥1 alert keyword-matches) vs CLEAR (no alert signal).
 * Coverage % tile; ALL/FLAGGED/CLEAR filter tabs + search; click-to-expand matched alerts.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence operational brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const ORG = "#FF6B35";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 107_100;
const Z_INDEX  = 183;

const OALTASK_RE =
  /\boaltask\b|\bops.?alert.?task\b|\balert.?task.?coverage\b|\bwhich.?tasks.?have.?alerts?\b|\btask.?alerts?\b|\bflagged.?tasks?\b|\btask.?alert.?match\b|\balert.?flagged.?tasks?\b|\bops.?task.?alerts?\b|\btask.?ops.?alerts?\b/i;

export function isOaltaskQuery(text) {
  return OALTASK_RE.test(text || "");
}

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
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.tasks)
    ? data.tasks
    : Array.isArray(data?.items)
    ? data.items
    : [];
  return arr.map((t, i) => ({
    id:          t.id          || String(i),
    title:       t.title       || t.name  || t.label || `Task ${i + 1}`,
    status:      (t.status     || t.state || "UNKNOWN").toString().toUpperCase(),
    description: t.description || t.body  || t.detail || t.notes || "",
    tags:        Array.isArray(t.tags) ? t.tags.join(" ") : (t.tags || ""),
  }));
}

function normaliseAlerts(data) {
  if (!data) return [];
  const arr = Array.isArray(data)
    ? data
    : Array.isArray(data?.alerts)
    ? data.alerts
    : Array.isArray(data?.data)
    ? data.data
    : [];
  return arr.map((a, i) => ({
    id:       a.id       || a.alert_id  || String(i),
    title:    a.title    || a.name      || a.summary || `Alert ${i + 1}`,
    severity: (a.severity || a.level    || "INFO").toString().toUpperCase(),
    source:   a.source   || a.service   || a.origin || "",
    message:  a.message  || a.description || a.body || "",
  }));
}

function crossRef(tasks, alerts) {
  return tasks.map((task) => {
    const haystack = `${task.title} ${task.description} ${task.tags}`;
    const matches = alerts
      .map((al) => {
        const needle = `${al.title} ${al.source} ${al.message}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...al, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...task, flagged: matches.length > 0, alerts: matches };
  });
}

export async function buildOaltaskScript() {
  try {
    const base = apiBase();
    const hdr = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, alertRes] = await Promise.all([
      fetch(`${base}/entities/Task`,      { headers: hdr }),
      fetch(`${base}/v1/ops/alerts`,      { headers: hdr }),
    ]);
    const [taskData, alertData] = await Promise.all([taskRes.json(), alertRes.json()]);
    const tasks  = normaliseTasks(taskData);
    const alerts = normaliseAlerts(alertData);
    const rows   = crossRef(tasks, alerts);
    const flagged = rows.filter((r) => r.flagged).length;
    const clear   = rows.length - flagged;
    const pct = rows.length ? Math.round((flagged / rows.length) * 100) : 0;
    if (!rows.length) return "No tasks found in the mission queue, sir.";
    const topFlagged = rows
      .filter((r) => r.flagged)
      .slice(0, 2)
      .map((r) => r.title)
      .join("; ");
    return (
      `${flagged} of ${rows.length} tasks are flagged by active ops alerts (${pct}% alert exposure). ` +
      (flagged > 0
        ? `Alert-flagged tasks include: ${topFlagged || "unknown"} — these missions intersect with live operational alerts.`
        : `${clear} task${clear !== 1 ? "s" : ""} show no alert correlation — mission queue appears operationally clear.`)
    );
  } catch {
    return "Unable to reach ops alerts or task endpoints, sir.";
  }
}

const SEV_COLOR = {
  CRITICAL: RED,
  HIGH:     ORG,
  MEDIUM:   AMB,
  WARNING:  AMB,
  INFO:     CY,
  LOW:      GRN,
};

const STATUS_COLOR = {
  DONE:        GRN,
  COMPLETE:    GRN,
  COMPLETED:   GRN,
  IN_PROGRESS: CY,
  PENDING:     AMB,
  BLOCKED:     RED,
  CANCELLED:   DIM,
};

export default function OpsAlertTaskCoverage() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const hdr = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, alertRes] = await Promise.all([
        fetch(`${base}/entities/Task`,  { headers: hdr }),
        fetch(`${base}/v1/ops/alerts`,  { headers: hdr }),
      ]);
      const [taskData, alertData] = await Promise.all([taskRes.json(), alertRes.json()]);
      const tasks  = normaliseTasks(taskData);
      const alerts = normaliseAlerts(alertData);
      setRows(crossRef(tasks, alerts));
    } catch {
      /* silently ignore fetch errors */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((p) => !p); if (!rows.length) load(); };
    window.addEventListener("jarvis:oaltask-toggle", handler);
    return () => window.removeEventListener("jarvis:oaltask-toggle", handler);
  }, [load, rows.length]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const flagged = rows.filter((r) => r.flagged).length;
  const clear   = rows.length - flagged;
  const pct     = rows.length ? Math.round((flagged / rows.length) * 100) : 0;

  const visible = rows
    .filter((r) => {
      if (filter === "FLAGGED") return r.flagged;
      if (filter === "CLEAR")   return !r.flagged;
      return true;
    })
    .filter((r) =>
      !search ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.status.toLowerCase().includes(search.toLowerCase())
    );

  const assess = async () => {
    setAssessing(true);
    setBrief("");
    try {
      const summary = await buildOaltaskScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `JARVIS ops-alert task brief: ${summary}` }),
      });
      const d = await r.json();
      const text = d.response || d.message || d.content || summary;
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment unavailable — check backend connectivity, sir.");
    } finally {
      setAssessing(false);
    }
  };

  return (
    <>
      {/* HUD button */}
      <button
        onClick={() => { setOpen((p) => !p); if (!rows.length) load(); }}
        style={{
          position: "fixed",
          left:     BTN_LEFT,
          bottom:   8,
          zIndex:   Z_INDEX,
          background: flagged > 0 ? `${ORG}22` : "rgba(0,0,0,0.55)",
          border:   `1px solid ${flagged > 0 ? ORG : CY}55`,
          borderRadius: 5,
          color:    flagged > 0 ? ORG : CY,
          padding:  "3px 8px",
          fontSize: 9,
          letterSpacing: 1,
          cursor:   "pointer",
          backdropFilter: "blur(4px)",
        }}
      >
        ◈ OALTASK
        {flagged > 0 && (
          <span style={{ marginLeft: 5, background: ORG, color: "#000", borderRadius: 9, padding: "0 5px", fontSize: 8, fontWeight: 700 }}>
            {flagged}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: Math.min(BTN_LEFT, window.innerWidth - 360),
            bottom: 36,
            zIndex: Z_INDEX + 1,
            width: 340,
            maxHeight: 480,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            background: "rgba(6,12,22,0.97)",
            border: `1px solid ${CY}33`,
            borderRadius: 8,
            padding: 14,
            fontFamily: "monospace",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>OPS ALERTS × TASKS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[
              { label: "TASKS",    value: rows.length, col: CY },
              { label: "FLAGGED",  value: flagged,     col: ORG },
              { label: "CLEAR",    value: clear,        col: GRN },
              { label: "EXPOSURE", value: `${pct}%`,   col: pct >= 50 ? ORG : GRN },
            ].map((t) => (
              <div key={t.label} style={{ flex: 1, background: `${t.col}11`, border: `1px solid ${t.col}33`, borderRadius: 5, padding: "5px 4px", textAlign: "center" }}>
                <div style={{ color: t.col, fontSize: 12, fontWeight: 700 }}>{t.value}</div>
                <div style={{ color: DIM, fontSize: 7, letterSpacing: 1 }}>{t.label}</div>
              </div>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search tasks…"
            style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CY}33`, borderRadius: 4, color: "#DCEBF5", padding: "4px 8px", fontSize: 10, marginBottom: 6, outline: "none" }}
          />

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["ALL", "FLAGGED", "CLEAR"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  flex: 1,
                  background: filter === f ? `${CY}22` : "transparent",
                  border: `1px solid ${filter === f ? CY : CY + "33"}`,
                  borderRadius: 4,
                  color: filter === f ? CY : DIM,
                  padding: "3px 0",
                  fontSize: 8,
                  cursor: "pointer",
                  letterSpacing: 1,
                }}
              >
                {f}
              </button>
            ))}
          </div>

          {/* list */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {loading && <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>Loading…</div>}
            {!loading && visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", padding: 16 }}>No tasks match filter.</div>
            )}
            {visible.map((task) => (
              <div
                key={task.id}
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                style={{
                  background: task.flagged ? `${ORG}09` : "rgba(255,255,255,0.02)",
                  border: `1px solid ${task.flagged ? ORG + "33" : CY + "1A"}`,
                  borderRadius: 5,
                  padding: "6px 8px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{
                    fontSize: 8,
                    border: `1px solid ${task.flagged ? ORG : GRN}44`,
                    borderRadius: 3,
                    padding: "1px 4px",
                    color: task.flagged ? ORG : GRN,
                    letterSpacing: 1,
                  }}>
                    {task.flagged ? "FLAGGED" : "CLEAR"}
                  </span>
                  <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{task.title}</span>
                  {task.flagged && (
                    <span style={{ color: DIM, fontSize: 9 }}>{task.alerts.length} al</span>
                  )}
                </div>
                {task.status && (
                  <div style={{ color: STATUS_COLOR[task.status] || DIM, fontSize: 9, marginLeft: 16 }}>
                    {task.status}
                  </div>
                )}

                {expanded === task.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${ORG}22`, paddingTop: 6 }}>
                    {task.flagged ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {task.alerts.map((al) => (
                          <div key={al.id} style={{ background: "rgba(255,107,53,0.04)", border: `1px solid ${ORG}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{
                                color: SEV_COLOR[al.severity] || CY,
                                fontSize: 9,
                                border: `1px solid ${(SEV_COLOR[al.severity] || CY)}44`,
                                borderRadius: 3,
                                padding: "1px 4px",
                              }}>
                                {al.severity}
                              </span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{al.title}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {al.hits}</span>
                            </div>
                            {al.source && (
                              <div style={{ color: DIM, fontSize: 8, marginTop: 2 }}>{al.source}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No ops alerts matched this task — mission appears clear.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${ORG}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{
                background: `${ORG}18`,
                border: `1px solid ${ORG}55`,
                borderRadius: 5,
                color: ORG,
                padding: "5px 12px",
                cursor: "pointer",
                fontSize: 10,
                letterSpacing: 1,
                width: "100%",
                opacity: assessing ? 0.6 : 1,
              }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${ORG}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
