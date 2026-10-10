/**
 * TaskOpsEventsCorrelator — F663
 * "JARVIS, tasoev / task ops events / ops event task / task event correlation /
 *  tasks in ops / task ops match / event-backed tasks / untracked tasks"
 *
 * Cross-reference: /entities/Task × /v1/ops/events
 * MATCHED   — task keyword overlaps ≥1 ops event (task has live operational signal)
 * UNTRACKED — task has no ops event overlap (potential blind spot)
 *
 * Coverage % tile; ALL/MATCHED/UNTRACKED filter tabs + search;
 * click-to-expand matched events (severity badge + hit count);
 * ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS;
 * amber badge on untracked count; 90-s auto-refresh.
 * ◈ TASOEV button left:121720 bottom:8 zIndex:200.
 *
 * Additive only — mounted via App.jsx; intent helpers exported for JarvisBrain.
 */
import { useEffect, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const GRN = "#00E5A0";
const AMB = "#FFA500";
const RED = "#FF4444";
const DIM = "#8899AA";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS  = 90_000;
const BTN_LEFT = 121_720;
const Z_INDEX  = 200;

const TASOEV_RE =
  /\btasoev\b|\btask.?ops?.?events?\b|\bops?.?event.?task\b|\btask.?event.?corr\b|\btasks?.?in.?ops\b|\btask.?ops?.?match\b|\bevent.?backed.?tasks?\b|\buntracked.?tasks?\b/i;

export function isTasoevQuery(text) {
  return TASOEV_RE.test(text || "");
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

function taskText(t) {
  return [t.title, t.name, t.description, t.notes, t.status, t.priority,
          t.assignee, t.tags, t.category, t.label]
    .filter(Boolean).join(" ");
}

function eventText(e) {
  return [e.title, e.name, e.description, e.service, e.source, e.category,
          e.message, e.kind, e.tags]
    .filter(Boolean).join(" ");
}

function normalise(raw, keys) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  for (const k of keys) {
    if (Array.isArray(raw[k])) return raw[k];
  }
  return [];
}

const SEV_COLOR = { CRITICAL: RED, HIGH: "#FF8844", MEDIUM: AMB, LOW: GRN };

export async function buildTasoevScript() {
  const BASE = apiBase();
  const [tR, eR] = await Promise.allSettled([
    fetch(`${BASE}/entities/Task`).then((r) => r.json()),
    fetch(`${BASE}/v1/ops/events`).then((r) => r.json()),
  ]);
  const tasks  = normalise(tR.status === "fulfilled" ? tR.value : [],
    ["items","results","data","tasks","records","entities"]);
  const events = normalise(eR.status === "fulfilled" ? eR.value : [],
    ["items","results","data","events","records"]);

  const matched   = tasks.filter((t) =>
    events.some((ev) => overlap(taskText(t), eventText(ev)) > 0)
  );
  const untracked = tasks.length - matched.length;
  const coverage  = tasks.length ? Math.round((matched.length / tasks.length) * 100) : 0;

  const topMatched = matched.slice(0, 3)
    .map((t) => t.title || t.name || "?")
    .join(", ");

  return (
    `Task × Ops Events Correlator: ${tasks.length} tasks cross-referenced against ` +
    `${events.length} operational events. ` +
    `${matched.length} tasks are MATCHED with live ops events (${coverage}% coverage). ` +
    `${untracked} tasks are UNTRACKED (no ops signal). ` +
    (topMatched ? `Top matched tasks: ${topMatched}.` : "No task-event overlaps detected.")
  );
}

/* ─── component ─── */

export default function TaskOpsEventsCorrelator() {
  const [open,       setOpen]       = useState(false);
  const [tasks,      setTasks]      = useState([]);
  const [events,     setEvents]     = useState([]);
  const [enriched,   setEnriched]   = useState([]);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const [lastFetch,  setLastFetch]  = useState(null);
  const [loading,    setLoading]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const BASE = apiBase();
    try {
      const [tR, eR] = await Promise.allSettled([
        fetch(`${BASE}/entities/Task`).then((r) => r.json()),
        fetch(`${BASE}/v1/ops/events`).then((r) => r.json()),
      ]);
      setTasks(normalise(
        tR.status === "fulfilled" ? tR.value : [],
        ["items","results","data","tasks","records","entities"]
      ));
      setEvents(normalise(
        eR.status === "fulfilled" ? eR.value : [],
        ["items","results","data","events","records"]
      ));
      setLastFetch(new Date());
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [open, load]);

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("jarvis:tasoev-toggle", handler);
    return () => window.removeEventListener("jarvis:tasoev-toggle", handler);
  }, []);

  useEffect(() => {
    if (!tasks.length) { setEnriched([]); return; }
    const e = tasks.map((t) => {
      const tt = taskText(t);
      const matchedEvs = events
        .map((ev) => ({ ...ev, _hits: overlap(tt, eventText(ev)) }))
        .filter((ev) => ev._hits > 0)
        .sort((a, b) => b._hits - a._hits);
      return { ...t, _matched: matchedEvs.length > 0, _events: matchedEvs };
    });
    e.sort((a, b) => (b._matched ? 1 : 0) - (a._matched ? 1 : 0));
    setEnriched(e);
  }, [tasks, events]);

  const matched   = enriched.filter((e) => e._matched).length;
  const untracked = enriched.length - matched;
  const coverage  = enriched.length
    ? Math.round((matched / enriched.length) * 100)
    : 0;

  const visible = enriched.filter((e) => {
    if (tab === "MATCHED"   && !e._matched) return false;
    if (tab === "UNTRACKED" &&  e._matched) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (e.title || e.name || "").toLowerCase().includes(q);
  });

  const handleAssess = useCallback(async () => {
    setAssessing(true);
    setAssessment("");
    try {
      const script = await buildTasoevScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ message: script }),
      });
      const d = await r.json();
      const txt = (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(txt);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: txt } }));
    } catch { setAssessment("Assessment unavailable."); } finally { setAssessing(false); }
  }, []);

  const badge = untracked > 0 ? untracked : null;

  const TABS = ["ALL", "MATCHED", "UNTRACKED"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: Z_INDEX,
          background: open ? "#1a1f2e" : "#0d111c",
          border: `1px solid ${open ? CY : "#2a3040"}`,
          borderRadius: 6, color: CY, fontFamily: "monospace",
          fontSize: 11, padding: "4px 10px", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}
        title="Task × Ops Events Correlator"
      >
        ◈ TASOEV
        {badge != null && (
          <span style={{
            background: AMB, color: "#000",
            borderRadius: 10, fontSize: 9, padding: "1px 6px",
          }}>{badge}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: "fixed", bottom: 44, left: BTN_LEFT - 260, zIndex: Z_INDEX + 1,
          width: 580, maxHeight: "70vh", background: "#0d111c",
          border: `1px solid ${CY}33`, borderRadius: 10,
          display: "flex", flexDirection: "column", overflow: "hidden",
          fontFamily: "monospace", color: "#cdd",
        }}>
          {/* Header */}
          <div style={{
            padding: "10px 14px", borderBottom: `1px solid ${CY}22`,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ color: CY, fontSize: 13, fontWeight: 700 }}>
              ◈ TASK × OPS EVENTS CORRELATOR
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {lastFetch && (
                <span style={{ fontSize: 9, color: DIM }}>
                  {lastFetch.toLocaleTimeString()}
                </span>
              )}
              {loading && <span style={{ fontSize: 10, color: AMB }}>loading…</span>}
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: DIM, cursor: "pointer", fontSize: 16 }}
              >×</button>
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            padding: "8px 14px", display: "flex", gap: 12,
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {[
              { label: "Tasks",     value: enriched.length, color: CY },
              { label: "Matched",   value: matched,         color: GRN },
              { label: "Untracked", value: untracked,       color: AMB },
              { label: "Ops Events",value: events.length,   color: DIM },
              { label: "Coverage",  value: `${coverage}%`,  color: coverage >= 60 ? GRN : coverage >= 30 ? AMB : RED },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: "#131929", borderRadius: 6, padding: "4px 10px",
                display: "flex", flexDirection: "column", alignItems: "center", minWidth: 68,
              }}>
                <span style={{ color, fontSize: 15, fontWeight: 700 }}>{value}</span>
                <span style={{ color: DIM, fontSize: 9 }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Filter tabs + search */}
          <div style={{
            padding: "6px 14px", display: "flex", gap: 6, alignItems: "center",
            borderBottom: `1px solid ${CY}11`, flexWrap: "wrap",
          }}>
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "none",
                  border: `1px solid ${tab === t ? CY : "#2a3040"}`,
                  borderRadius: 4, color: tab === t ? CY : DIM,
                  fontSize: 10, padding: "2px 8px", cursor: "pointer",
                }}
              >{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search tasks…"
              style={{
                marginLeft: "auto", background: "#111827", border: `1px solid #2a3040`,
                borderRadius: 4, color: "#cdd", fontSize: 10, padding: "3px 8px",
                width: 130, outline: "none",
              }}
            />
          </div>

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1, padding: "6px 0" }}>
            {visible.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, textAlign: "center", padding: 20 }}>
                No tasks found.
              </div>
            )}
            {visible.map((t, i) => {
              const label = t.title || t.name || `Task #${i + 1}`;
              const isExp = expanded === i;
              return (
                <div
                  key={i}
                  onClick={() => setExpanded(isExp ? null : i)}
                  style={{
                    padding: "6px 14px", cursor: "pointer",
                    borderBottom: `1px solid ${CY}0a`,
                    background: isExp ? "#131929" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      background: t._matched ? `${GRN}22` : `${AMB}22`,
                      color: t._matched ? GRN : AMB,
                      borderRadius: 4, fontSize: 9, padding: "1px 6px", minWidth: 68, textAlign: "center",
                    }}>
                      {t._matched ? "MATCHED" : "UNTRACKED"}
                    </span>
                    <span style={{ fontSize: 11, flex: 1 }}>{label}</span>
                    {t._matched && (
                      <span style={{ color: DIM, fontSize: 9 }}>
                        {t._events.length} event{t._events.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {isExp && t._matched && (
                    <div style={{ marginTop: 6, paddingLeft: 8 }}>
                      {t._events.slice(0, 5).map((ev, j) => {
                        const sev = (ev.severity || ev.level || "INFO").toUpperCase();
                        return (
                          <div key={j} style={{
                            display: "flex", gap: 6, alignItems: "center",
                            marginBottom: 3, fontSize: 10,
                          }}>
                            <span style={{
                              background: `${SEV_COLOR[sev] || DIM}22`,
                              color: SEV_COLOR[sev] || DIM,
                              borderRadius: 3, fontSize: 8, padding: "1px 5px",
                            }}>{sev}</span>
                            <span style={{ color: "#aab", flex: 1 }}>
                              {ev.title || ev.name || ev.service || "—"}
                            </span>
                            <span style={{ color: DIM, fontSize: 9 }}>
                              ×{ev._hits}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {isExp && !t._matched && (
                    <div style={{ marginTop: 4, paddingLeft: 8, color: DIM, fontSize: 10 }}>
                      No ops event overlap detected for this task.
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{
            padding: "8px 14px", borderTop: `1px solid ${CY}22`,
            display: "flex", gap: 8, alignItems: "center",
          }}>
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background: `${CY}18`, border: `1px solid ${CY}44`,
                borderRadius: 5, color: CY, fontSize: 10,
                padding: "4px 12px", cursor: assessing ? "not-allowed" : "pointer",
              }}
            >
              {assessing ? "Assessing…" : "▶ ASSESS"}
            </button>
            <button
              onClick={load}
              style={{
                background: "none", border: `1px solid #2a3040`,
                borderRadius: 5, color: DIM, fontSize: 10,
                padding: "4px 10px", cursor: "pointer",
              }}
            >↻ Refresh</button>
            {assessment && (
              <span style={{ fontSize: 10, color: "#aab", flex: 1 }}>{assessment}</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
