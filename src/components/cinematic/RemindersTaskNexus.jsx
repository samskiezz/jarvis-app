/**
 * RemindersTaskNexus — F631
 * "JARVIS, remtask / reminder task / task reminder / task-backed reminders /
 *  floating reminders / orphan reminders / reminders without tasks"
 * Cross-references /reminders/list against /entities/Task.
 * TASK-BACKED reminders (≥1 task keyword-matches) vs FLOATING (no task backing).
 * Coverage % tile; ALL/TASK-BACKED/FLOATING filter tabs + search; click-to-expand matched tasks.
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence task-memory brief + TTS.
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";
const PRP = "#B06EFF";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 101_940;
const Z_INDEX  = 177;

const REMTASK_RE =
  /\bremtask\b|\breminder.?task\b|\btask.?reminder\b|\btask.?backed.?remind\b|\bfloating.?remind\b|\borphan.?remind\b|\breminders?.without.?task\b|\bremind.?without.?task\b/i;

export function isRemtaskQuery(text) {
  return REMTASK_RE.test(text || "");
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

function normaliseReminders(data) {
  if (!data) return [];
  const raw =
    data.reminders || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((r, i) => ({
    id:    r.id || `rem-${i}`,
    title: r.title || r.text || r.body || r.content || `Reminder ${i + 1}`,
    kind:  (r.kind || r.type || r.category || "reminder").toLowerCase(),
    status: r.status || r.state || "pending",
    tags:  r.tags || [],
  }));
}

function normaliseTasks(data) {
  if (!data) return [];
  const raw =
    data.tasks || data.items || data.results ||
    (Array.isArray(data) ? data : []);
  return raw.map((t, i) => ({
    id:       t.id || `tsk-${i}`,
    title:    t.title || t.name || t.description || `Task ${i + 1}`,
    status:   (t.status || t.state || "pending").toUpperCase(),
    priority: (t.priority || "medium").toUpperCase(),
    tags:     t.tags || [],
  }));
}

function crossRef(reminders, tasks) {
  return reminders.map((rem) => {
    const haystack = `${rem.title} ${rem.kind} ${(rem.tags || []).join(" ")}`;
    const matches = tasks
      .map((t) => {
        const needle = `${t.title} ${(t.tags || []).join(" ")}`;
        const hits = overlap(haystack, needle);
        return hits > 0 ? { ...t, hits } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.hits - a.hits);
    return { ...rem, backed: matches.length > 0, tasks: matches };
  });
}

export async function buildRemtaskScript() {
  try {
    const base = apiBase();
    const [remRes, tskRes] = await Promise.all([
      fetch(`${base}/reminders/list`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${base}/entities/Task`,   { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const [remData, tskData] = await Promise.all([remRes.json(), tskRes.json()]);
    const reminders = normaliseReminders(remData);
    const tasks     = normaliseTasks(tskData);
    const rows      = crossRef(reminders, tasks);
    const backed    = rows.filter((r) => r.backed).length;
    const floating  = rows.length - backed;
    const pct       = rows.length ? Math.round((backed / rows.length) * 100) : 0;
    if (!rows.length) return "No reminders found in the system, sir.";
    const topFloating = rows
      .filter((r) => !r.backed)
      .slice(0, 2)
      .map((r) => r.title.slice(0, 40))
      .join("; ");
    return (
      `${backed} of ${rows.length} reminders are task-backed (${pct}% task coverage). ` +
      (floating > 0
        ? `${floating} reminder${floating !== 1 ? "s" : ""} have no matching task — potential orphaned action items: ${topFloating || "unknown"}.`
        : "All reminders have an associated task — full task-memory alignment confirmed.")
    );
  } catch {
    return "Unable to reach reminders or task endpoints, sir.";
  }
}

const KIND_COLOR = {
  note:     CY,
  task:     GRN,
  alert:    RED,
  reminder: PRP,
};

const STATUS_COLOR = {
  DONE:        GRN,
  COMPLETED:   GRN,
  IN_PROGRESS: AMB,
  BLOCKED:     RED,
  PENDING:     DIM,
};

export default function RemindersTaskNexus() {
  const [open,      setOpen]      = useState(false);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [brief,     setBrief]     = useState("");
  const [assessing, setAssessing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base = apiBase();
      const [remRes, tskRes] = await Promise.all([
        fetch(`${base}/reminders/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
        fetch(`${base}/entities/Task`,  { headers: { Authorization: `Bearer ${API_KEY}` } }),
      ]);
      const [remData, tskData] = await Promise.all([remRes.json(), tskRes.json()]);
      setRows(crossRef(normaliseReminders(remData), normaliseTasks(tskData)));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => { setOpen((v) => !v); };
    window.addEventListener("jarvis:remtask-toggle", handler);
    return () => window.removeEventListener("jarvis:remtask-toggle", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  const backed   = rows.filter((r) => r.backed).length;
  const floating = rows.length - backed;
  const pct      = rows.length ? Math.round((backed / rows.length) * 100) : 0;

  const visible = rows.filter((r) => {
    const matchTab =
      tab === "ALL"         ? true :
      tab === "TASK-BACKED" ? r.backed :
      !r.backed;
    const q = search.toLowerCase();
    const matchSearch = !q || r.title.toLowerCase().includes(q) || r.kind.includes(q);
    return matchTab && matchSearch;
  });

  async function assess() {
    if (assessing || rows.length === 0) return;
    setAssessing(true);
    setBrief("");
    try {
      const base   = apiBase();
      const script = await buildRemtaskScript();
      const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: `Reminder-task alignment assessment: ${script}. Provide a concise 2-sentence operational brief.` }),
      });
      const d    = await r.json();
      const text = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setBrief(text);
      if (text) {
        window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
      }
    } catch {
      setBrief("Unable to reach reasoning core, sir.");
    } finally {
      setAssessing(false);
    }
  }

  const tabStyle = (t) => ({
    background:   tab === t ? `${PRP}22` : "transparent",
    border:       `1px solid ${tab === t ? PRP : DIM}44`,
    borderRadius: 4,
    color:        tab === t ? PRP : DIM,
    cursor:       "pointer",
    fontSize:     9,
    letterSpacing: 1,
    padding:      "3px 7px",
  });

  const badge = floating > 0 ? floating : null;

  return (
    <>
      {/* floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Reminders × Task Nexus (REMTASK)"
        style={{
          position:      "fixed",
          left:          BTN_LEFT,
          bottom:        8,
          zIndex:        Z_INDEX,
          background:    open ? `${PRP}22` : "rgba(5,8,13,0.75)",
          border:        `1px solid ${PRP}${open ? "99" : "44"}`,
          borderRadius:  5,
          color:         PRP,
          cursor:        "pointer",
          fontSize:      9,
          letterSpacing: 1,
          padding:       "4px 8px",
          backdropFilter: "blur(6px)",
          whiteSpace:    "nowrap",
        }}
      >
        ◈ REMTASK
        {badge ? (
          <span style={{ marginLeft: 4, background: AMB, color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 9 }}>
            {badge}
          </span>
        ) : null}
      </button>

      {/* panel */}
      {open && (
        <div
          style={{
            position:      "fixed",
            left:          BTN_LEFT,
            bottom:        36,
            zIndex:        Z_INDEX + 1,
            width:         340,
            maxHeight:     "70vh",
            overflowY:     "auto",
            background:    "rgba(4,7,12,0.96)",
            border:        `1px solid ${PRP}44`,
            borderRadius:  8,
            padding:       "12px 14px",
            backdropFilter: "blur(14px)",
            boxShadow:     `0 0 28px ${PRP}22`,
            fontFamily:    "monospace",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: PRP, fontSize: 11, letterSpacing: 2, fontWeight: "bold" }}>REMINDERS × TASK NEXUS</span>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
            {[
              { label: "REMINDERS",   value: rows.length, color: CY },
              { label: "TASK-BACKED", value: backed,      color: GRN },
              { label: "FLOATING",    value: floating,    color: floating > 0 ? AMB : GRN },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{ background: "rgba(0,0,0,0.4)", border: `1px solid ${color}33`, borderRadius: 6, padding: "6px 8px", textAlign: "center" }}
              >
                <div style={{ color, fontSize: 16, fontWeight: "bold" }}>{loading ? "…" : value}</div>
                <div style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* coverage bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: DIM, fontSize: 9, letterSpacing: 1 }}>TASK COVERAGE</span>
              <span style={{ color: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, fontSize: 10, fontWeight: "bold" }}>{pct}%</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 2 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct >= 70 ? GRN : pct >= 40 ? AMB : RED, borderRadius: 2, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* filter tabs */}
          <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
            {["ALL", "TASK-BACKED", "FLOATING"].map((t) => (
              <button key={t} style={tabStyle(t)} onClick={() => setTab(t)}>{t}</button>
            ))}
          </div>

          {/* search */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="search reminders…"
            style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.4)", border: `1px solid ${PRP}33`, borderRadius: 5, color: "#DCEBF5", padding: "5px 8px", fontSize: 11, marginBottom: 8, outline: "none" }}
          />

          {/* list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {visible.length === 0 && !loading && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 12 }}>No reminders match.</div>
            )}
            {visible.map((rem) => (
              <div
                key={rem.id}
                style={{ background: "rgba(0,0,0,0.35)", border: `1px solid ${rem.backed ? PRP : AMB}33`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === rem.id ? null : rem.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: rem.backed ? PRP : AMB, fontSize: 10 }}>{rem.backed ? "●" : "○"}</span>
                  <span style={{ color: "#DCEBF5", fontSize: 11, flex: 1 }}>{rem.title.slice(0, 44)}</span>
                  <span style={{ color: KIND_COLOR[rem.kind] || DIM, fontSize: 9, border: `1px solid ${(KIND_COLOR[rem.kind] || DIM)}44`, borderRadius: 3, padding: "1px 4px" }}>
                    {rem.kind.toUpperCase()}
                  </span>
                  <span style={{ color: rem.backed ? PRP : DIM, fontSize: 9 }}>
                    {rem.backed ? `${rem.tasks.length} task${rem.tasks.length !== 1 ? "s" : ""}` : "FLOATING"}
                  </span>
                </div>

                {expanded === rem.id && (
                  <div style={{ marginTop: 6, borderTop: `1px solid ${PRP}22`, paddingTop: 6 }}>
                    {rem.backed ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {rem.tasks.map((t) => (
                          <div key={t.id} style={{ background: "rgba(176,110,255,0.04)", border: `1px solid ${PRP}33`, borderRadius: 4, padding: "5px 7px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ color: STATUS_COLOR[t.status] || DIM, fontSize: 9, border: `1px solid ${(STATUS_COLOR[t.status] || DIM)}44`, borderRadius: 3, padding: "1px 4px" }}>{t.status}</span>
                              <span style={{ color: "#DCEBF5", fontSize: 10, flex: 1 }}>{t.title.slice(0, 36)}</span>
                              <span style={{ color: DIM, fontSize: 9 }}>hits: {t.hits}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ color: DIM, fontSize: 10 }}>No task matches this reminder — orphaned action item with no task backing.</div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* assess */}
          <div style={{ marginTop: 10, borderTop: `1px solid ${PRP}22`, paddingTop: 8 }}>
            <button
              onClick={assess}
              disabled={assessing || rows.length === 0}
              style={{ background: `${PRP}18`, border: `1px solid ${PRP}55`, borderRadius: 5, color: PRP, padding: "5px 12px", cursor: "pointer", fontSize: 10, letterSpacing: 1, width: "100%", opacity: assessing ? 0.6 : 1 }}
            >
              {assessing ? "▶ ASSESSING…" : "▶ ASSESS"}
            </button>
            {brief && (
              <div style={{ marginTop: 8, color: "#DCEBF5", fontSize: 10, lineHeight: 1.5, borderLeft: `2px solid ${PRP}`, paddingLeft: 8 }}>
                {brief}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
