/**
 * PanicKeyControlPanel — F273.
 *
 * Data sources (all real — backed by server/routes/panickey.py):
 *   GET  /v1/panickey/active
 *       → {ts, mode, services:[], calls:{}, jobs:[], events:[]}
 *   GET  /v1/panickey/snapshots
 *       → {items:[{id, t, label, mode, services, disk, calls, rules}]}
 *   POST /v1/panickey/snapshot  {label?}
 *       → {ok, snapshot:{id, t, label, mode, ...}}
 *   POST /v1/panickey/snapshot/{id}/restore
 *       → {ok, mode, restored_from}
 *   POST /v1/panickey/safemode
 *       → {ok, mode}
 *
 * Displays:
 *   - Stat tiles: mode / pm2-services / llm-calls-1h / active-jobs
 *   - ACTIVE|SNAPSHOTS tab switcher + text search
 *   - ACTIVE: mode chip + service rows (name/status/cpu/mem) + recent events
 *   - SNAPSHOTS: list with label/mode/age + ▶ RESTORE + ✦ SNAP (create new)
 *   - ⚠ SAFE MODE header button → POST /v1/panickey/safemode
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◈ PKCTL at left:265200, bottom:8, zIndex:151.
 * Badge: red=safe/emergency, amber=normal+events, green=normal+clean.
 * 60 s auto-refresh of active snapshot.
 *
 * Exported helpers for JarvisBrain:
 *   isPkctlQuery(q) / buildPkctlScript()
 *
 * Voice triggers: "panickey / panic / safe mode / emergency control /
 *   system control / pkctl / snapshot control / system mode /
 *   active services / mode control / crisis control"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const RD  = "#F87171";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const CY  = "#29E7FF";
const PU  = "#A78BFA";
const DIM = "#3A4A55";

const BTN_LEFT  = 265200;
const POLL_MS   = 60_000;
const API_KEY   =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const PKCTL_RE =
  /\b(panickey|panic\b|safe\s+mode|emergency\s+control|system\s+control|pkctl\b|snapshot\s+control|system\s+mode|crisis\s+control|active\s+services|mode\s+control|system\s+snapshot\s+control|emergency\s+mode)\b/i;

export function isPkctlQuery(t) {
  return PKCTL_RE.test(t || "");
}

export async function buildPkctlScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/panickey/active`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const mode      = d?.mode || "unknown";
    const svcCount  = (d?.services || []).length;
    const online    = (d?.services || []).filter(s => s.status === "online").length;
    const jobs      = (d?.jobs || []).length;
    const calls1h   = d?.calls?.total_calls ?? 0;
    return (
      `PanicKey Control: system mode is "${mode}". ` +
      `${online}/${svcCount} services online, ${jobs} active job${jobs !== 1 ? "s" : ""}, ` +
      `${calls1h} LLM call${calls1h !== 1 ? "s" : ""} in the last hour. ` +
      `Use SNAPSHOTS tab to capture or restore system state.`
    );
  } catch {
    return "PanicKey Control Panel is unavailable at this time, sir.";
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "string" ? new Date(ts).getTime() / 1000 : Number(ts);
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function modeColor(m) {
  if (m === "safe" || m === "emergency") return RD;
  if (m === "recovery") return AM;
  if (m === "focus") return CY;
  return GN;
}

function svcColor(s) {
  if (s === "online") return GN;
  if (s === "stopping" || s === "stopped") return AM;
  return RD;
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchActive() {
  const r = await fetch(`${apiBase()}/v1/panickey/active`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchSnapshots() {
  const r = await fetch(`${apiBase()}/v1/panickey/snapshots`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  const items = Array.isArray(d) ? d : (d?.items || []);
  return [...items].reverse();
}

async function postSnapshot(label) {
  const r = await fetch(`${apiBase()}/v1/panickey/snapshot`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ label: label || "manual" }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function restoreSnapshot(id) {
  const r = await fetch(`${apiBase()}/v1/panickey/snapshot/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postSafeMode() {
  const r = await fetch(`${apiBase()}/v1/panickey/safemode`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(active) {
  const mode    = active?.mode || "unknown";
  const online  = (active?.services || []).filter(s => s.status === "online").length;
  const total   = (active?.services || []).length;
  const calls1h = active?.calls?.total_calls ?? 0;
  const prompt  =
    `PanicKey system state: mode="${mode}", ${online}/${total} services online, ` +
    `${calls1h} LLM calls in last hour. ` +
    `Give a 2-sentence operational status brief and recommend any immediate action.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── Tile ─────────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      background: "#0D1A20", border: `1px solid ${color || CY}33`,
      borderRadius: 6, padding: "8px 12px", minWidth: 90, flex: "1 1 90px",
    }}>
      <div style={{ color: color || CY, fontSize: 18, fontWeight: 700, lineHeight: 1 }}>{value ?? "—"}</div>
      <div style={{ color: "#6A8899", fontSize: 10, marginTop: 3, textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PanicKeyControlPanel() {
  const [open, setOpen]         = useState(false);
  const [tab, setTab]           = useState("ACTIVE");
  const [q, setQ]               = useState("");
  const [active, setActive]     = useState(null);
  const [snaps, setSnaps]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState({});
  const [notice, setNotice]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessment, setAssessment] = useState("");
  const pollRef = useRef(null);

  const showNotice = (msg, ms = 3500) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), ms);
  };

  const loadActive = useCallback(async () => {
    try {
      const d = await fetchActive();
      setActive(d);
      setErr("");
    } catch (e) {
      setErr(String(e));
    }
  }, []);

  const loadSnapshots = useCallback(async () => {
    try {
      const items = await fetchSnapshots();
      setSnaps(items);
    } catch {}
  }, []);

  useEffect(() => {
    loadActive();
    pollRef.current = setInterval(loadActive, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [loadActive]);

  useEffect(() => {
    const fn = () => setOpen(v => !v);
    window.addEventListener("jarvis:pkctl-toggle", fn);
    return () => window.removeEventListener("jarvis:pkctl-toggle", fn);
  }, []);

  useEffect(() => {
    if (open && tab === "SNAPSHOTS") loadSnapshots();
  }, [open, tab, loadSnapshots]);

  // ── badge ──────────────────────────────────────────────────────────────────
  const mode     = active?.mode || "";
  const services = active?.services || [];
  const events   = active?.events || [];
  const jobs     = active?.jobs || [];
  const calls1h  = active?.calls?.total_calls ?? 0;
  const online   = services.filter(s => s.status === "online").length;

  const badgeColor =
    (mode === "safe" || mode === "emergency") ? RD :
    events.length > 0 ? AM : GN;

  const badgeLabel = mode || "—";

  // ── search filter ──────────────────────────────────────────────────────────
  const lq = q.toLowerCase();
  const filteredSvcs = services.filter(s =>
    !lq || (s.name || "").toLowerCase().includes(lq) || (s.status || "").toLowerCase().includes(lq)
  );
  const filteredSnaps = snaps.filter(s =>
    !lq || (s.label || "").toLowerCase().includes(lq) || (s.mode || "").toLowerCase().includes(lq) || (s.id || "").toLowerCase().includes(lq)
  );
  const filteredEvents = events.filter(e =>
    !lq || JSON.stringify(e).toLowerCase().includes(lq)
  );

  // ── actions ────────────────────────────────────────────────────────────────
  async function handleSafeMode() {
    setBusy(b => ({ ...b, safemode: true }));
    try {
      const d = await postSafeMode();
      showNotice(d?.ok ? `Safe mode activated (mode: ${d.mode})` : "Safe mode failed");
      await loadActive();
    } catch (e) {
      showNotice(`Error: ${e}`);
    } finally {
      setBusy(b => ({ ...b, safemode: false }));
    }
  }

  async function handleSnap() {
    setBusy(b => ({ ...b, snap: true }));
    try {
      const d = await postSnapshot("manual-pkctl");
      showNotice(d?.ok ? `Snapshot ${d.snapshot?.id} created` : "Snapshot failed");
      await loadSnapshots();
    } catch (e) {
      showNotice(`Error: ${e}`);
    } finally {
      setBusy(b => ({ ...b, snap: false }));
    }
  }

  async function handleRestore(id) {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      const d = await restoreSnapshot(id);
      showNotice(d?.ok ? `Restored — mode: ${d.mode}` : (d?.error || "Restore failed"));
      await loadActive();
    } catch (e) {
      showNotice(`Error: ${e}`);
    } finally {
      setBusy(b => ({ ...b, [id]: false }));
    }
  }

  async function handleAssess() {
    setAssessing(true);
    setAssessment("");
    try {
      const brief = await agentAssess(active);
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: brief }));
    } catch {
      setAssessment("Assessment failed.");
    } finally {
      setAssessing(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="PanicKey Control Panel"
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 151,
          background: "#0D1A20", border: `1px solid ${badgeColor}55`,
          borderRadius: 6, color: badgeColor, fontFamily: "monospace",
          fontSize: 10, fontWeight: 700, padding: "3px 8px",
          cursor: "pointer", letterSpacing: 1, whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 5,
        }}
      >
        ◈ PKCTL
        {badgeLabel && (
          <span style={{
            background: `${badgeColor}22`, color: badgeColor,
            borderRadius: 4, padding: "1px 5px", fontSize: 9,
          }}>
            {badgeLabel.toUpperCase()}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", right: 18, top: "8%", width: 520, maxHeight: "80vh",
      background: "#06111A", border: `1px solid ${RD}44`,
      borderRadius: 12, boxShadow: `0 0 40px ${RD}18`,
      zIndex: 9200, display: "flex", flexDirection: "column",
      fontFamily: "monospace", color: "#C9D8E0", fontSize: 12,
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", borderBottom: `1px solid ${RD}33`,
        background: "#08161E",
      }}>
        <span style={{ color: RD, fontWeight: 700, fontSize: 13, flex: 1 }}>
          ◈ PANICKEY CONTROL
        </span>
        {mode && (
          <span style={{
            background: `${modeColor(mode)}22`, color: modeColor(mode),
            border: `1px solid ${modeColor(mode)}55`, borderRadius: 4,
            padding: "2px 8px", fontSize: 10, fontWeight: 700,
            textTransform: "uppercase", letterSpacing: 1,
          }}>
            {mode}
          </span>
        )}
        <button
          onClick={handleSafeMode}
          disabled={busy.safemode}
          title="Enter safe mode"
          style={{
            background: `${RD}22`, border: `1px solid ${RD}55`, borderRadius: 4,
            color: RD, padding: "3px 10px", fontSize: 10, cursor: "pointer",
            fontFamily: "monospace", fontWeight: 700,
          }}
        >
          {busy.safemode ? "…" : "⚠ SAFE MODE"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: "none", color: "#6A8899",
            cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
          }}
        >×</button>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "flex", gap: 8, padding: "10px 16px", flexWrap: "wrap" }}>
        <Tile label="Mode"      value={mode || "—"}     color={modeColor(mode)} />
        <Tile label="Services"  value={`${online}/${services.length}`} color={online === services.length && services.length > 0 ? GN : AM} />
        <Tile label="Calls 1h"  value={calls1h}         color={CY} />
        <Tile label="Active Jobs" value={jobs.length}   color={PU} />
      </div>

      {/* Tabs + search */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        padding: "0 16px 8px", borderBottom: `1px solid #1A2A33`,
      }}>
        {["ACTIVE", "SNAPSHOTS"].map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setQ(""); if (t === "SNAPSHOTS") loadSnapshots(); }}
            style={{
              background: tab === t ? `${RD}22` : "none",
              border: "none", borderBottom: tab === t ? `2px solid ${RD}` : "2px solid transparent",
              color: tab === t ? RD : "#6A8899",
              padding: "6px 14px", cursor: "pointer", fontFamily: "monospace",
              fontSize: 11, fontWeight: 700, letterSpacing: 1,
            }}
          >
            {t}
            {t === "SNAPSHOTS" && snaps.length > 0 && (
              <span style={{ marginLeft: 5, color: AM, fontSize: 9 }}>{snaps.length}</span>
            )}
          </button>
        ))}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="search…"
          style={{
            marginLeft: "auto", background: "#0D1A20", border: `1px solid #1A2A33`,
            borderRadius: 4, color: CY, padding: "3px 8px", fontSize: 11,
            fontFamily: "monospace", outline: "none", width: 130,
          }}
        />
      </div>

      {/* Notice bar */}
      {notice && (
        <div style={{ padding: "4px 16px", background: `${AM}18`, color: AM, fontSize: 10, fontWeight: 700 }}>
          {notice}
        </div>
      )}

      {/* Error */}
      {err && (
        <div style={{ padding: "4px 16px", color: RD, fontSize: 10 }}>
          Error: {err}
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
        {tab === "ACTIVE" && (
          <>
            {/* Services */}
            <div style={{ color: "#6A8899", fontSize: 10, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
              PM2 SERVICES
            </div>
            {filteredSvcs.length === 0 && (
              <div style={{ color: DIM, fontSize: 11, marginBottom: 10 }}>No services found.</div>
            )}
            {filteredSvcs.map((svc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "5px 0", borderBottom: "1px solid #0D1A20",
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: svcColor(svc.status), flexShrink: 0, display: "inline-block",
                }} />
                <span style={{ flex: 1, color: "#C9D8E0", fontSize: 11 }}>{svc.name || "—"}</span>
                <span style={{
                  color: svcColor(svc.status), fontSize: 9, fontWeight: 700,
                  background: `${svcColor(svc.status)}18`, borderRadius: 3, padding: "1px 5px",
                }}>
                  {(svc.status || "?").toUpperCase()}
                </span>
                {svc.cpu != null && (
                  <span style={{ color: CY, fontSize: 9, minWidth: 38 }}>CPU {svc.cpu}%</span>
                )}
                {svc.mem_mb != null && (
                  <span style={{ color: PU, fontSize: 9, minWidth: 42 }}>{svc.mem_mb} MB</span>
                )}
                {svc.restarts != null && svc.restarts > 0 && (
                  <span style={{ color: AM, fontSize: 9 }}>↺{svc.restarts}</span>
                )}
              </div>
            ))}

            {/* Recent events */}
            {filteredEvents.length > 0 && (
              <>
                <div style={{ color: "#6A8899", fontSize: 10, fontWeight: 700, margin: "12px 0 6px", letterSpacing: 1 }}>
                  RECENT EVENTS
                </div>
                {filteredEvents.map((ev, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 8, alignItems: "center",
                    padding: "4px 0", borderBottom: "1px solid #0D1A20",
                    fontSize: 10,
                  }}>
                    <span style={{
                      color: AM, background: `${AM}18`, borderRadius: 3,
                      padding: "1px 5px", fontWeight: 700,
                    }}>
                      {ev.type || ev.kind || ev.event_type || "EVENT"}
                    </span>
                    <span style={{ color: "#8A9AA5", flex: 1 }}>
                      {ev.actor ? `actor: ${ev.actor}` : (ev.message || ev.detail || "")}
                    </span>
                    <span style={{ color: DIM, flexShrink: 0 }}>{age(ev.ts || ev.created_at)}</span>
                  </div>
                ))}
              </>
            )}

            {/* Jobs */}
            {jobs.length > 0 && (
              <>
                <div style={{ color: "#6A8899", fontSize: 10, fontWeight: 700, margin: "12px 0 6px", letterSpacing: 1 }}>
                  ACTIVE JOBS
                </div>
                {jobs.map((job, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 8, fontSize: 10,
                    padding: "3px 0", borderBottom: "1px solid #0D1A20",
                  }}>
                    <span style={{ color: CY, flex: 1 }}>
                      {job.task_id || job.id || `job-${i}`}
                    </span>
                    <span style={{ color: "#8A9AA5" }}>
                      {job.status || job.state || "running"}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {tab === "SNAPSHOTS" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ color: "#6A8899", fontSize: 10, fontWeight: 700, letterSpacing: 1, flex: 1 }}>
                SAVED SNAPSHOTS ({filteredSnaps.length})
              </span>
              <button
                onClick={handleSnap}
                disabled={busy.snap}
                style={{
                  background: `${CY}18`, border: `1px solid ${CY}44`, borderRadius: 4,
                  color: CY, padding: "3px 10px", fontSize: 10, cursor: "pointer",
                  fontFamily: "monospace", fontWeight: 700,
                }}
              >
                {busy.snap ? "…" : "✦ SNAP"}
              </button>
            </div>

            {filteredSnaps.length === 0 && (
              <div style={{ color: DIM, fontSize: 11 }}>No snapshots yet — click ✦ SNAP to create one.</div>
            )}

            {filteredSnaps.map((snap) => (
              <div key={snap.id} style={{
                padding: "8px 10px", marginBottom: 6,
                background: "#0D1A20", border: "1px solid #1A2A33",
                borderRadius: 6,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ color: "#C9D8E0", fontSize: 11, flex: 1, fontWeight: 700 }}>
                    {snap.label || snap.id}
                  </span>
                  <span style={{
                    background: `${modeColor(snap.mode)}18`, color: modeColor(snap.mode),
                    border: `1px solid ${modeColor(snap.mode)}44`, borderRadius: 3,
                    padding: "1px 5px", fontSize: 9, fontWeight: 700, textTransform: "uppercase",
                  }}>
                    {snap.mode || "normal"}
                  </span>
                  <span style={{ color: DIM, fontSize: 9 }}>{age(snap.t)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: "#6A8899", fontSize: 9 }}>
                    {snap.id}
                  </span>
                  {snap.disk?.used_gb != null && (
                    <span style={{ color: AM, fontSize: 9 }}>
                      disk {snap.disk.used_gb.toFixed(1)}GB/{snap.disk.total_gb?.toFixed(0)}GB
                    </span>
                  )}
                  <button
                    onClick={() => handleRestore(snap.id)}
                    disabled={busy[snap.id]}
                    style={{
                      marginLeft: "auto",
                      background: `${GN}18`, border: `1px solid ${GN}44`, borderRadius: 4,
                      color: GN, padding: "2px 8px", fontSize: 9, cursor: "pointer",
                      fontFamily: "monospace", fontWeight: 700,
                    }}
                  >
                    {busy[snap.id] ? "…" : "▶ RESTORE"}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Assessment */}
      {assessment && (
        <div style={{
          padding: "8px 16px", borderTop: `1px solid #1A2A33`,
          color: "#A0C4D0", fontSize: 11, lineHeight: 1.5,
          background: "#08161E",
        }}>
          {assessment}
        </div>
      )}

      {/* Footer */}
      <div style={{
        display: "flex", gap: 8, padding: "8px 16px",
        borderTop: `1px solid #1A2A33`, background: "#06111A",
        alignItems: "center",
      }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            background: `${CY}18`, border: `1px solid ${CY}44`, borderRadius: 4,
            color: CY, padding: "4px 12px", fontSize: 10, cursor: "pointer",
            fontFamily: "monospace", fontWeight: 700,
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <span style={{ color: DIM, fontSize: 9, flex: 1 }}>
          auto-refresh 60s · /v1/panickey
        </span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "none", border: `1px solid #1A2A33`, borderRadius: 4,
            color: "#6A8899", padding: "3px 10px", fontSize: 10, cursor: "pointer",
            fontFamily: "monospace",
          }}
        >
          CLOSE
        </button>
      </div>
    </div>
  );
}
