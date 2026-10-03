/**
 * F81 — Task × Live Intel Exposure (TLIE)
 *
 * Parallel-fetches /entities/Task and /functions/getLiveIntel, then
 * keyword-correlates each task (title, description, tags, priority) against
 * live world events (crypto price movements, FX rate changes, seismic events)
 * to surface:
 *
 *   TRIGGERED — at least one live world event keyword-matches this task
 *   QUIET     — no live events align with this task currently
 *
 * Stat tiles: tasks / live events / triggered / quiet
 * Filter tabs: ALL | TRIGGERED | QUIET + text search
 * Expand task → matched live events with event type badge (CRYPTO/FX/SEISMIC)
 *   + relevance score bar.
 * Amber badge on triggered count.
 * ▶ ASSESS: 2-sentence task live-intelligence brief via /v1/jarvis/agent/chat +
 *   jarvis:speak-dossier TTS.
 *
 * Toggle:  ◈ TLIE  at left:2340 bottom:18, zIndex:68.
 * Event:   jarvis:tlie-toggle
 * Voice:   "task live intel / live task / tlie / task world event /
 *           triggered tasks / task world alert / which tasks are triggered /
 *           task intel / live task exposure / task signal"
 * Refresh: 60 s auto-poll.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const BTN_LEFT = 2340;
const POLL_MS  = 60_000;
const AMBER    = "#F59E0B";
const CYAN     = "#29E7FF";
const GREEN    = "#34D399";
const SLATE    = "#6E8AA0";
const VIOLET   = "#A78BFA";
const ROSE     = "#FB7185";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ── exported intent helpers ───────────────────────────────────────────────────

const TLIE_RE =
  /\b(task\s+live\s+intel|live\s+task[s]?|tlie|task\s+world\s+event[s]?|triggered\s+task[s]?|task\s+world\s+alert[s]?|which\s+tasks?\s+(are\s+)?triggered|task\s+intel|live\s+task\s+exposure|task\s+signal[s]?|task\s+world\s+exposure)\b/i;

export function isTlieQuery(q) { return TLIE_RE.test(q); }

// ── normalise helpers ─────────────────────────────────────────────────────────

function normaliseTasks(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.items ?? raw?.data ?? raw?.tasks ?? []);
  return arr.map((x) => ({
    id:       x.id ?? x._id ?? String(Math.random()),
    title:    String(x.title ?? x.name ?? "Task"),
    desc:     String(x.description ?? x.summary ?? x.notes ?? ""),
    tags:     Array.isArray(x.tags) ? x.tags.join(" ") : String(x.tags ?? ""),
    priority: String(x.priority ?? x.severity ?? ""),
    status:   String(x.status ?? x.state ?? ""),
  }));
}

function normaliseLiveIntel(raw) {
  const events = [];

  const quakes = Array.isArray(raw?.earthquakes) ? raw.earthquakes : [];
  quakes.forEach((q) => {
    events.push({
      id:       `eq-${q.id ?? q.place ?? Math.random()}`,
      type:     "SEISMIC",
      label:    String(q.place ?? q.location ?? "Seismic event"),
      keywords: [
        String(q.place ?? ""),
        String(q.location ?? ""),
        "earthquake", "seismic", "quake", "tremor",
      ].join(" ").toLowerCase(),
      detail: `M${q.magnitude ?? "?"} at ${q.place ?? "unknown"}`,
    });
  });

  const crypto = Array.isArray(raw?.crypto) ? raw.crypto : [];
  crypto.forEach((c) => {
    const sym   = String(c.symbol ?? c.name ?? "CRYPTO").toUpperCase();
    const label = `${sym} ${c.change_pct != null ? (c.change_pct >= 0 ? "+" : "") + c.change_pct.toFixed(2) + "%" : ""}`;
    events.push({
      id:       `cx-${sym}`,
      type:     "CRYPTO",
      label,
      keywords: [sym, "crypto", "bitcoin", "ethereum", "digital asset", "blockchain", "token", "defi"].join(" ").toLowerCase(),
      detail:   `${sym} price: ${c.price ?? "n/a"}, change: ${c.change_pct != null ? c.change_pct.toFixed(2) + "%" : "n/a"}`,
    });
  });

  const fx = Array.isArray(raw?.fx) ? raw.fx : [];
  fx.forEach((f) => {
    const pair  = String(f.pair ?? f.symbol ?? f.name ?? "FX").toUpperCase();
    const label = `${pair} ${f.change_pct != null ? (f.change_pct >= 0 ? "+" : "") + f.change_pct.toFixed(2) + "%" : ""}`;
    events.push({
      id:       `fx-${pair}`,
      type:     "FX",
      label,
      keywords: [pair, "forex", "fx", "currency", "exchange rate", "dollar", "euro", "yen"].join(" ").toLowerCase(),
      detail:   `${pair} rate: ${f.rate ?? f.price ?? "n/a"}, change: ${f.change_pct != null ? f.change_pct.toFixed(2) + "%" : "n/a"}`,
    });
  });

  return events;
}

function relevance(task, ev) {
  const haystack = [task.title, task.desc, task.tags, task.priority].join(" ").toLowerCase();
  const needles  = ev.keywords.split(/\s+/).filter((w) => w.length > 2);
  let score = 0;
  needles.forEach((n) => { if (haystack.includes(n)) score += 1; });
  return score;
}

function correlate(tasks, events) {
  return tasks.map((t) => {
    const matches = events
      .map((ev) => ({ ev, score: relevance(t, ev) }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score);
    return { ...t, matches, triggered: matches.length > 0 };
  });
}

// ── async build helper exported for JarvisBrain ───────────────────────────────

export async function buildTlieScript() {
  try {
    const base = apiBase();
    const hdr  = { Authorization: `Bearer ${API_KEY}` };
    const [taskRes, intelRes] = await Promise.all([
      fetch(`${base}/entities/Task`,              { headers: hdr }),
      fetch(`${base}/functions/getLiveIntel`,     { headers: hdr }),
    ]);
    const tasks  = normaliseTasks(await taskRes.json());
    const events = normaliseLiveIntel(await intelRes.json());
    const rows   = correlate(tasks, events);

    const triggered = rows.filter((r) => r.triggered).length;
    const quiet     = tasks.length - triggered;
    const cryptoEv  = events.filter((e) => e.type === "CRYPTO").length;
    const fxEv      = events.filter((e) => e.type === "FX").length;
    const seismicEv = events.filter((e) => e.type === "SEISMIC").length;

    const r = await fetch(`${base}/v1/jarvis/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        message:
          `JARVIS task × live-intel exposure scan: ${tasks.length} active tasks cross-referenced ` +
          `against ${events.length} live world signals ` +
          `(${cryptoEv} crypto, ${fxEv} FX, ${seismicEv} seismic). ` +
          `${triggered} tasks show live-world-event correlation (TRIGGERED); ${quiet} are QUIET. ` +
          `Provide a 2-sentence task live-intelligence brief — formal British butler tone, ` +
          `first person, highlight which task domains are most exposed to live world signals.`,
      }),
    });
    const d = await r.json();
    return (d.answer || "Task live-intelligence scan complete, sir.").trim();
  } catch {
    return "Live-intelligence task scan unavailable at this time, sir.";
  }
}

// ── badge colour for event type ───────────────────────────────────────────────

function typeBadgeStyle(type) {
  if (type === "CRYPTO")  return { background: VIOLET, color: "#fff" };
  if (type === "FX")      return { background: CYAN,   color: "#000" };
  if (type === "SEISMIC") return { background: ROSE,   color: "#fff" };
  return { background: SLATE, color: "#fff" };
}

// ── component ─────────────────────────────────────────────────────────────────

export default function TaskLiveIntelExposure() {
  const [open,      setOpen]      = useState(false);
  const [tab,       setTab]       = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [expanded,  setExpanded]  = useState(null);
  const [rows,      setRows]      = useState([]);
  const [events,    setEvents]    = useState([]);
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState("");
  const [err,       setErr]       = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const base = apiBase();
      const hdr  = { Authorization: `Bearer ${API_KEY}` };
      const [taskRes, intelRes] = await Promise.all([
        fetch(`${base}/entities/Task`,              { headers: hdr }),
        fetch(`${base}/functions/getLiveIntel`,     { headers: hdr }),
      ]);
      if (!taskRes.ok || !intelRes.ok) throw new Error("fetch failed");
      const tasks = normaliseTasks(await taskRes.json());
      const ev    = normaliseLiveIntel(await intelRes.json());
      setRows(correlate(tasks, ev));
      setEvents(ev);
      setErr("");
    } catch (e) {
      setErr(String(e.message ?? e));
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const h = () => setOpen((o) => !o);
    window.addEventListener("jarvis:tlie-toggle", h);
    return () => window.removeEventListener("jarvis:tlie-toggle", h);
  }, []);

  const triggered  = rows.filter((r) => r.triggered).length;
  const quiet      = rows.length - triggered;
  const cryptoEv   = events.filter((e) => e.type === "CRYPTO").length;
  const fxEv       = events.filter((e) => e.type === "FX").length;
  const seismicEv  = events.filter((e) => e.type === "SEISMIC").length;

  const filtered = rows.filter((r) => {
    if (tab === "TRIGGERED" && !r.triggered)  return false;
    if (tab === "QUIET"     &&  r.triggered)  return false;
    if (search) {
      const s = search.toLowerCase();
      if (!r.title.toLowerCase().includes(s) && !r.desc.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const assess = async () => {
    setAssessing(true); setBrief("");
    const script = await buildTlieScript();
    setBrief(script);
    setAssessing(false);
    window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
  };

  const S = {
    overlay: {
      position: "fixed", bottom: 56, left: BTN_LEFT, zIndex: 68,
      background: "rgba(10,20,35,0.97)", border: "1px solid #29E7FF44",
      borderRadius: 10, padding: 18, width: 560, maxHeight: "80vh",
      overflowY: "auto", fontFamily: "'JetBrains Mono',monospace",
      color: "#C8D8E8", fontSize: 11,
    },
    btn: {
      position: "fixed", bottom: 18, left: BTN_LEFT, zIndex: 68,
      background: triggered ? "rgba(245,158,11,0.18)" : "rgba(10,20,35,0.85)",
      border: `1px solid ${triggered ? AMBER : "#29E7FF44"}`,
      borderRadius: 6, color: triggered ? AMBER : CYAN,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
      padding: "4px 9px", cursor: "pointer", letterSpacing: 1,
    },
    tile: {
      display: "inline-block", background: "rgba(41,231,255,0.07)",
      border: "1px solid #29E7FF22", borderRadius: 6,
      padding: "5px 10px", margin: "0 6px 6px 0", minWidth: 80,
    },
    tileVal: { fontSize: 17, fontWeight: 700, color: CYAN },
    tileLabel: { fontSize: 9, color: SLATE, letterSpacing: 1 },
    tabBtn: (active) => ({
      background: active ? "rgba(41,231,255,0.15)" : "transparent",
      border: `1px solid ${active ? CYAN : "#29E7FF33"}`,
      borderRadius: 4, color: active ? CYAN : SLATE,
      fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
      padding: "3px 8px", cursor: "pointer", marginRight: 4,
    }),
    row: {
      borderBottom: "1px solid #29E7FF11", padding: "8px 0",
      cursor: "pointer",
    },
    badge: (triggered) => ({
      display: "inline-block", borderRadius: 3, padding: "1px 5px",
      fontSize: 9, fontWeight: 700, marginLeft: 6,
      background: triggered ? `${AMBER}22` : `${SLATE}22`,
      color: triggered ? AMBER : SLATE,
      border: `1px solid ${triggered ? AMBER : SLATE}44`,
    }),
    statusBadge: (status) => {
      const s = (status || "").toUpperCase();
      const col = s === "DONE" || s === "COMPLETED" ? GREEN :
                  s === "IN_PROGRESS" || s === "ACTIVE" ? CYAN :
                  SLATE;
      return {
        display: "inline-block", borderRadius: 3, padding: "1px 5px",
        fontSize: 9, fontWeight: 700, marginLeft: 4,
        color: col, border: `1px solid ${col}44`,
      };
    },
  };

  return (
    <>
      <button style={S.btn} onClick={() => setOpen((o) => !o)}>
        ◈ TLIE
        {triggered > 0 && (
          <span style={{
            background: AMBER, color: "#000", borderRadius: 8,
            padding: "0 5px", marginLeft: 5, fontSize: 9, fontWeight: 700,
          }}>{triggered}</span>
        )}
      </button>

      {open && (
        <div style={S.overlay}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{ color: CYAN, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>
              ◈ TASK × LIVE INTEL EXPOSURE
            </span>
            <button onClick={() => setOpen(false)} style={{
              background: "transparent", border: "none", color: SLATE,
              cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>

          {/* Stat tiles */}
          <div style={{ marginBottom: 12 }}>
            {[
              { val: rows.length,   label: "TASKS" },
              { val: events.length, label: "LIVE EVENTS" },
              { val: triggered,     label: "TRIGGERED", color: AMBER },
              { val: quiet,         label: "QUIET",     color: GREEN },
            ].map(({ val, label, color }) => (
              <span key={label} style={S.tile}>
                <div style={{ ...S.tileVal, color: color ?? CYAN }}>{val}</div>
                <div style={S.tileLabel}>{label}</div>
              </span>
            ))}
          </div>

          {/* Event type breakdown */}
          <div style={{ marginBottom: 10, fontSize: 10, color: SLATE }}>
            Live signals: {cryptoEv} CRYPTO · {fxEv} FX · {seismicEv} SEISMIC
          </div>

          {/* Filter tabs + search */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {["ALL", "TRIGGERED", "QUIET"].map((t) => (
              <button key={t} style={S.tabBtn(tab === t)} onClick={() => setTab(t)}>{t}</button>
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              style={{
                background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33",
                borderRadius: 4, color: "#C8D8E8", fontFamily: "'JetBrains Mono',monospace",
                fontSize: 10, padding: "3px 8px", marginLeft: "auto", width: 160,
              }}
            />
          </div>

          {/* Assess button */}
          <button
            onClick={assess}
            disabled={assessing}
            style={{
              background: "rgba(41,231,255,0.1)", border: "1px solid #29E7FF55",
              borderRadius: 5, color: CYAN, fontFamily: "'JetBrains Mono',monospace",
              fontSize: 10, padding: "4px 12px", cursor: "pointer", marginBottom: 10,
            }}
          >
            {assessing ? "▷ ASSESSING…" : "▶ ASSESS"}
          </button>

          {brief && (
            <div style={{
              background: "rgba(41,231,255,0.06)", border: "1px solid #29E7FF33",
              borderRadius: 6, padding: 10, marginBottom: 10, color: "#C8D8E8",
              fontSize: 10, lineHeight: 1.6,
            }}>
              {brief}
            </div>
          )}

          {err && <div style={{ color: ROSE, fontSize: 10, marginBottom: 8 }}>⚠ {err}</div>}

          {/* Rows */}
          <div>
            {filtered.length === 0 && (
              <div style={{ color: SLATE, fontSize: 10, padding: "12px 0" }}>No tasks match filter.</div>
            )}
            {filtered.map((r) => {
              const isExp = expanded === r.id;
              return (
                <div key={r.id} style={S.row} onClick={() => setExpanded(isExp ? null : r.id)}>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <span style={{ color: "#C8D8E8", fontWeight: 600, flex: 1 }}>{r.title}</span>
                    <span style={S.badge(r.triggered)}>{r.triggered ? "TRIGGERED" : "QUIET"}</span>
                    {r.status && <span style={S.statusBadge(r.status)}>{r.status.toUpperCase()}</span>}
                    {r.priority && (
                      <span style={{ marginLeft: 4, fontSize: 9, color: SLATE }}>
                        {r.priority.toUpperCase()}
                      </span>
                    )}
                    <span style={{ marginLeft: 8, color: SLATE, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
                  </div>

                  {isExp && (
                    <div style={{ marginTop: 8, paddingLeft: 4 }}>
                      {r.desc && (
                        <div style={{ color: SLATE, fontSize: 10, marginBottom: 6 }}>{r.desc}</div>
                      )}
                      {r.matches.length === 0 ? (
                        <div style={{ color: SLATE, fontSize: 10 }}>No live world events match this task.</div>
                      ) : (
                        r.matches.slice(0, 8).map(({ ev, score }) => {
                          const maxScore = r.matches[0].score || 1;
                          const pct = Math.round((score / maxScore) * 100);
                          return (
                            <div key={ev.id} style={{
                              background: "rgba(41,231,255,0.04)", borderRadius: 4,
                              padding: "5px 8px", marginBottom: 4,
                            }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                <span style={{
                                  ...typeBadgeStyle(ev.type),
                                  borderRadius: 3, padding: "1px 5px",
                                  fontSize: 9, fontWeight: 700,
                                }}>{ev.type}</span>
                                <span style={{ color: "#C8D8E8", fontSize: 10 }}>{ev.label}</span>
                                <span style={{ marginLeft: "auto", color: CYAN, fontSize: 10 }}>
                                  {score} pts
                                </span>
                              </div>
                              <div style={{ fontSize: 9, color: SLATE, marginBottom: 3 }}>{ev.detail}</div>
                              <div style={{
                                height: 3, borderRadius: 2,
                                background: "rgba(41,231,255,0.12)", width: "100%",
                              }}>
                                <div style={{
                                  height: 3, borderRadius: 2,
                                  background: AMBER, width: `${pct}%`,
                                  transition: "width 0.4s",
                                }} />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 10, fontSize: 9, color: SLATE }}>
            Auto-refreshes every {POLL_MS / 1000} s · {rows.length} tasks · {events.length} live signals
          </div>
        </div>
      )}
    </>
  );
}
