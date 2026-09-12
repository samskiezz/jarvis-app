/**
 * AssuranceAutopilotPanel — F267.
 *
 * Data sources:
 *   GET /assurance/autopilot/status       (poll 90 s) → system-status blob
 *   GET /assurance/autopilot/roadmap      (on open) → {next:{next:[]}, backlog:[]}
 *   GET /assurance/autopilot/proposals    (on open) → {proposals:[{name,size,mtime}], count}
 *   GET /assurance/autopilot/subsystems   (on open) → subsystem-registry blob
 *   GET /assurance/autopilot/unknowns     (on open) → unknown-systems blob
 *   POST /assurance/autopilot/approve     {proposal_id, decision, note}
 *
 * Displays:
 *   - Stat tiles: proposals / next-actions / subsystems / ok-status
 *   - Tabs: STATUS | ROADMAP | PROPOSALS | SUBSYSTEMS | UNKNOWNS + text search
 *   - STATUS: raw system-status fields
 *   - ROADMAP: next-actions list + backlog list
 *   - PROPOSALS: file list with APPROVE / REJECT inline form
 *   - SUBSYSTEMS: registry entries with name/description/kind
 *   - UNKNOWNS: unknown-system entries
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence autopilot brief + TTS
 *
 * Toggle: ◎ APLT at left:237840, bottom:8, zIndex:145.
 * Green badge = status ok; amber badge = not ok or proposals pending.
 * 90 s auto-refresh of status.
 *
 * Exported helpers for JarvisBrain:
 *   isApltQuery(q) / buildApltScript()
 *
 * Voice triggers: "assurance / autopilot / mission control / proposal queue /
 *   system roadmap / aplt / autopilot proposals / unknown systems /
 *   subsystem registry / assurance autopilot / next actions / approve proposal"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const RED   = "#F87171";
const GREEN = "#4ADE80";
const GRAY  = "#4E6070";
const PURP  = "#B06EFF";

const BTN_LEFT   = 237840;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/assurance/autopilot/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

async function fetchRoadmap() {
  const r = await fetch(`${apiBase()}/assurance/autopilot/roadmap`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`roadmap ${r.status}`);
  return r.json();
}

async function fetchProposals() {
  const r = await fetch(`${apiBase()}/assurance/autopilot/proposals`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`proposals ${r.status}`);
  return r.json();
}

async function fetchSubsystems() {
  const r = await fetch(`${apiBase()}/assurance/autopilot/subsystems`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`subsystems ${r.status}`);
  return r.json();
}

async function fetchUnknowns() {
  const r = await fetch(`${apiBase()}/assurance/autopilot/unknowns`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`unknowns ${r.status}`);
  return r.json();
}

async function postApproval(proposalId, decision, note) {
  const r = await fetch(`${apiBase()}/assurance/autopilot/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ proposal_id: proposalId, decision, note: note || "" }),
  });
  if (!r.ok) throw new Error(`approve ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const APLT_RE =
  /\b(assurance|autopilot|mission.?control|proposal.?queue|system.?roadmap|aplt|autopilot.?proposal|unknown.?system|subsystem.?registry|assurance.?autopilot|next.?action|approve.?proposal|autopilot.?status|autopilot.?roadmap|autopilot.?subsystem|autopilot.?unknown)\b/i;

export function isApltQuery(q) {
  return APLT_RE.test(q || "");
}

export async function buildApltScript() {
  try {
    const [status, roadmap, proposals] = await Promise.all([
      fetchStatus(),
      fetchRoadmap(),
      fetchProposals(),
    ]);
    window.dispatchEvent(new CustomEvent("jarvis:aplt-toggle"));
    const isOk       = status?.ok !== false;
    const nextCount   = (roadmap?.next?.next ?? []).length;
    const backCount   = (roadmap?.backlog ?? []).length;
    const propCount   = proposals?.count ?? 0;
    const statusDesc  = isOk ? "nominal" : "degraded";
    return (
      `Assurance Autopilot is ${statusDesc}, sir. ` +
      `${nextCount} next-action${nextCount !== 1 ? "s" : ""} queued, ` +
      `${backCount} item${backCount !== 1 ? "s" : ""} in the backlog, ` +
      `and ${propCount} pending proposal${propCount !== 1 ? "s" : ""} awaiting approval. ` +
      (propCount > 0
        ? "Recommend reviewing proposals before proceeding with the roadmap."
        : "No pending proposals — roadmap clear for execution.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:aplt-toggle"));
    return "Assurance Autopilot panel open, sir.";
  }
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: `1px solid ${CY}22`,
        borderRadius: 7,
        padding: "7px 10px",
        textAlign: "center",
      }}
    >
      <div style={{ color: color ?? CY, fontSize: 15, fontWeight: 700, letterSpacing: 1 }}>
        {value ?? "–"}
      </div>
      <div style={{ color: GRAY, fontSize: 8, letterSpacing: 1, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? `${CY}22` : "transparent",
        border: `1px solid ${active ? CY + "88" : CY + "22"}`,
        borderRadius: 4,
        padding: "2px 7px",
        color: active ? CY : GRAY,
        fontSize: 9,
        letterSpacing: 1,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function FieldRow({ label, value, color }) {
  if (value === undefined || value === null) return null;
  const display = typeof value === "object" ? JSON.stringify(value) : String(value);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        padding: "4px 10px",
        borderBottom: `1px solid ${CY}18`,
        fontSize: 9,
      }}
    >
      <span style={{ color: GRAY, minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span
        style={{
          color: color ?? CY,
          flex: 1,
          wordBreak: "break-all",
          lineHeight: 1.4,
        }}
      >
        {display}
      </span>
    </div>
  );
}

function relAge(epochSec) {
  if (!epochSec) return "–";
  const s = Math.floor(Date.now() / 1000 - epochSec);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── STATUS tab ────────────────────────────────────────────────────────────────

function StatusTab({ status, search }) {
  if (!status) return <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>No status data.</div>;
  const entries = Object.entries(status).filter(([k]) =>
    !search || k.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div>
      {entries.map(([k, v]) => (
        <FieldRow
          key={k}
          label={k}
          value={v}
          color={
            k === "ok" ? (v ? GREEN : RED)
            : typeof v === "boolean" ? (v ? GREEN : AMBER)
            : CY
          }
        />
      ))}
      {entries.length === 0 && (
        <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>No matching fields.</div>
      )}
    </div>
  );
}

// ── ROADMAP tab ───────────────────────────────────────────────────────────────

function RoadmapTab({ roadmap, search }) {
  if (!roadmap) return <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>No roadmap data.</div>;
  const nextActions = roadmap?.next?.next ?? [];
  const backlog     = roadmap?.backlog ?? [];
  const q = search.toLowerCase();

  const filteredNext = q
    ? nextActions.filter((a) => JSON.stringify(a).toLowerCase().includes(q))
    : nextActions;
  const filteredBack = q
    ? backlog.filter((a) => JSON.stringify(a).toLowerCase().includes(q))
    : backlog;

  return (
    <div>
      <div style={{ color: AMBER, fontSize: 9, letterSpacing: 1, padding: "6px 10px 2px" }}>
        NEXT ACTIONS ({filteredNext.length})
      </div>
      {filteredNext.length === 0 && (
        <div style={{ color: GRAY, fontSize: 9, padding: "4px 10px 8px" }}>None.</div>
      )}
      {filteredNext.map((a, i) => {
        const label = a?.title || a?.action || a?.name || JSON.stringify(a);
        const prio  = a?.priority || a?.prio || "";
        return (
          <div
            key={i}
            style={{
              padding: "5px 10px",
              borderBottom: `1px solid ${CY}18`,
              fontSize: 9,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <span style={{ color: GREEN, minWidth: 12 }}>▸</span>
            <span style={{ color: CY, flex: 1, lineHeight: 1.4 }}>{label}</span>
            {prio && (
              <span
                style={{
                  color: prio === "high" ? RED : prio === "medium" ? AMBER : GRAY,
                  fontSize: 8,
                  border: `1px solid ${prio === "high" ? RED : AMBER}44`,
                  borderRadius: 3,
                  padding: "0 4px",
                }}
              >
                {prio}
              </span>
            )}
          </div>
        );
      })}

      <div style={{ color: GRAY, fontSize: 9, letterSpacing: 1, padding: "8px 10px 2px" }}>
        BACKLOG ({filteredBack.length})
      </div>
      {filteredBack.length === 0 && (
        <div style={{ color: GRAY, fontSize: 9, padding: "4px 10px 8px" }}>Empty.</div>
      )}
      {filteredBack.map((a, i) => {
        const label = a?.title || a?.action || a?.name || JSON.stringify(a);
        return (
          <div
            key={i}
            style={{
              padding: "4px 10px",
              borderBottom: `1px solid ${CY}12`,
              fontSize: 9,
              display: "flex",
              gap: 8,
              color: GRAY,
            }}
          >
            <span>◦</span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── PROPOSALS tab ─────────────────────────────────────────────────────────────

function ProposalsTab({ proposals, search, onDecisionMade }) {
  const [decisions, setDecisions]  = useState({});
  const [notes, setNotes]          = useState({});
  const [pending, setPending]      = useState({});
  const [outcomes, setOutcomes]    = useState({});

  const list = (proposals?.proposals ?? []).filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function decide(name, decision) {
    setPending((prev) => ({ ...prev, [name]: true }));
    try {
      await postApproval(name, decision, notes[name] || "");
      setOutcomes((prev) => ({ ...prev, [name]: decision }));
      onDecisionMade?.();
    } catch {
      setOutcomes((prev) => ({ ...prev, [name]: "error" }));
    } finally {
      setPending((prev) => ({ ...prev, [name]: false }));
    }
  }

  if (list.length === 0) {
    return (
      <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>
        {search ? "No matching proposals." : "No proposals on record."}
      </div>
    );
  }

  return (
    <div>
      {list.map((p) => {
        const outcome = outcomes[p.name];
        return (
          <div
            key={p.name}
            style={{
              padding: "7px 10px",
              borderBottom: `1px solid ${CY}22`,
              fontSize: 9,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: CY, flex: 1, wordBreak: "break-all" }}>{p.name}</span>
              <span style={{ color: GRAY, whiteSpace: "nowrap" }}>{relAge(p.mtime)}</span>
              <span style={{ color: GRAY }}>{Math.round(p.size / 1024 * 10) / 10}kb</span>
            </div>
            {!outcome && (
              <div style={{ marginTop: 5, display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={notes[p.name] || ""}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [p.name]: e.target.value }))
                  }
                  placeholder="note (optional)…"
                  style={{
                    flex: 1,
                    background: "rgba(41,231,255,0.06)",
                    border: `1px solid ${CY}22`,
                    borderRadius: 4,
                    padding: "2px 6px",
                    color: CY,
                    fontSize: 9,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  disabled={pending[p.name]}
                  onClick={() => decide(p.name, "approve")}
                  style={{
                    background: `${GREEN}18`,
                    border: `1px solid ${GREEN}55`,
                    borderRadius: 4,
                    padding: "2px 7px",
                    color: GREEN,
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: pending[p.name] ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✓ APPROVE
                </button>
                <button
                  disabled={pending[p.name]}
                  onClick={() => decide(p.name, "reject")}
                  style={{
                    background: `${RED}18`,
                    border: `1px solid ${RED}55`,
                    borderRadius: 4,
                    padding: "2px 7px",
                    color: RED,
                    fontSize: 9,
                    letterSpacing: 1,
                    cursor: pending[p.name] ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  ✕ REJECT
                </button>
              </div>
            )}
            {outcome && (
              <div
                style={{
                  marginTop: 4,
                  fontSize: 9,
                  color: outcome === "approve" ? GREEN : outcome === "reject" ? RED : AMBER,
                }}
              >
                {outcome === "error" ? "⚠ Decision failed — retry." : `✓ ${outcome.toUpperCase()}D`}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── SUBSYSTEMS tab ────────────────────────────────────────────────────────────

function SubsystemsTab({ subsystems, search }) {
  if (!subsystems) {
    return <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>No subsystem data.</div>;
  }

  const list = (() => {
    if (Array.isArray(subsystems)) return subsystems;
    if (Array.isArray(subsystems?.subsystems)) return subsystems.subsystems;
    if (Array.isArray(subsystems?.items)) return subsystems.items;
    return Object.entries(subsystems)
      .filter(([k]) => k !== "ok")
      .map(([k, v]) => ({ name: k, ...(typeof v === "object" ? v : { value: v }) }));
  })();

  const q = search.toLowerCase();
  const filtered = q
    ? list.filter((s) => JSON.stringify(s).toLowerCase().includes(q))
    : list;

  if (filtered.length === 0) {
    return (
      <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>
        {search ? "No matching subsystems." : "No subsystems registered."}
      </div>
    );
  }

  return (
    <div>
      {filtered.map((s, i) => {
        const name = s?.name || s?.id || `subsystem-${i}`;
        const kind = s?.kind || s?.type || "";
        const desc = s?.description || s?.desc || "";
        const status = s?.status || s?.state || "";
        return (
          <div
            key={i}
            style={{
              padding: "6px 10px",
              borderBottom: `1px solid ${CY}18`,
              fontSize: 9,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: PURP, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                {name}
              </span>
              {kind && (
                <span
                  style={{
                    color: CY,
                    border: `1px solid ${CY}33`,
                    borderRadius: 3,
                    padding: "0 4px",
                    fontSize: 8,
                  }}
                >
                  {kind}
                </span>
              )}
              {status && (
                <span
                  style={{
                    color: status === "ok" || status === "healthy" ? GREEN : AMBER,
                    fontSize: 8,
                  }}
                >
                  {status}
                </span>
              )}
            </div>
            {desc && (
              <div style={{ color: GRAY, marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── UNKNOWNS tab ──────────────────────────────────────────────────────────────

function UnknownsTab({ unknowns, search }) {
  if (!unknowns) {
    return <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>No unknown-systems data.</div>;
  }

  const list = (() => {
    if (Array.isArray(unknowns)) return unknowns;
    if (Array.isArray(unknowns?.systems)) return unknowns.systems;
    if (Array.isArray(unknowns?.items)) return unknowns.items;
    if (Array.isArray(unknowns?.unknowns)) return unknowns.unknowns;
    return Object.entries(unknowns)
      .filter(([k]) => k !== "ok")
      .map(([k, v]) => ({ name: k, ...(typeof v === "object" ? v : { value: String(v) }) }));
  })();

  const q = search.toLowerCase();
  const filtered = q
    ? list.filter((s) => JSON.stringify(s).toLowerCase().includes(q))
    : list;

  if (filtered.length === 0) {
    return (
      <div style={{ color: GRAY, fontSize: 9, padding: 16 }}>
        {search ? "No matching unknowns." : "No unknown systems detected — clean."}
      </div>
    );
  }

  return (
    <div>
      {filtered.map((s, i) => {
        const name  = s?.name || s?.id || s?.host || `unknown-${i}`;
        const kind  = s?.kind || s?.type || "";
        const notes = s?.notes || s?.description || s?.reason || "";
        return (
          <div
            key={i}
            style={{
              padding: "6px 10px",
              borderBottom: `1px solid ${RED}18`,
              fontSize: 9,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: RED, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
                ⚠ {name}
              </span>
              {kind && (
                <span
                  style={{
                    color: AMBER,
                    border: `1px solid ${AMBER}33`,
                    borderRadius: 3,
                    padding: "0 4px",
                    fontSize: 8,
                  }}
                >
                  {kind}
                </span>
              )}
            </div>
            {notes && (
              <div style={{ color: GRAY, marginTop: 2, lineHeight: 1.4 }}>{notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function AssuranceAutopilotPanel() {
  const [visible,    setVisible]    = useState(false);
  const [status,     setStatus]     = useState(null);
  const [roadmap,    setRoadmap]    = useState(null);
  const [proposals,  setProposals]  = useState(null);
  const [subsystems, setSubsystems] = useState(null);
  const [unknowns,   setUnknowns]   = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("STATUS");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:aplt-toggle", onToggle);
    return () => window.removeEventListener("jarvis:aplt-toggle", onToggle);
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const d = await fetchStatus();
      setStatus(d);
    } catch {
      // retain stale
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [st, rm, pr, ss, uk] = await Promise.allSettled([
        fetchStatus(),
        fetchRoadmap(),
        fetchProposals(),
        fetchSubsystems(),
        fetchUnknowns(),
      ]);
      if (st.status === "fulfilled") setStatus(st.value);
      if (rm.status === "fulfilled") setRoadmap(rm.value);
      if (pr.status === "fulfilled") setProposals(pr.value);
      if (ss.status === "fulfilled") setSubsystems(ss.value);
      if (uk.status === "fulfilled") setUnknowns(uk.value);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    loadAll();
    timerRef.current = setInterval(loadStatus, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, loadAll, loadStatus]);

  const isOk       = status?.ok !== false;
  const propCount  = proposals?.count ?? 0;
  const nextCount  = (roadmap?.next?.next ?? []).length;

  const sysCount = (() => {
    if (!subsystems) return 0;
    if (Array.isArray(subsystems)) return subsystems.length;
    if (Array.isArray(subsystems?.subsystems)) return subsystems.subsystems.length;
    if (Array.isArray(subsystems?.items)) return subsystems.items.length;
    return Object.keys(subsystems).filter((k) => k !== "ok").length;
  })();

  const badgeColor = !isOk || propCount > 0 ? AMBER : GREEN;
  const badgeVal   = !isOk ? "WARN" : propCount > 0 ? `${propCount} PROP` : null;

  async function handleAssess() {
    setAssessing(true);
    try {
      const ctx =
        `status_ok=${isOk}, proposals=${propCount}, next_actions=${nextCount}, subsystems=${sysCount}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message:
            `Interpret this Assurance Autopilot snapshot in 2 sentences: ${ctx}. ` +
            `Focus on operational readiness and the most urgent next action.`,
        }),
      });
      const d = await r.json();
      const text = d.response || d.reply || d.message || "Assessment complete.";
      setAssessment(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const TABS = ["STATUS", "ROADMAP", "PROPOSALS", "SUBSYSTEMS", "UNKNOWNS"];

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          zIndex: 145,
          background: visible ? `${CY}22` : "rgba(5,10,18,0.82)",
          border: `1px solid ${visible ? CY : CY + "55"}`,
          borderRadius: 6,
          padding: "3px 9px",
          color: visible ? CY : CY + "AA",
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 10,
          letterSpacing: 1,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        ◎ APLT
        {badgeVal != null && (
          <span
            style={{
              marginLeft: 5,
              background: badgeColor + "33",
              border: `1px solid ${badgeColor}66`,
              borderRadius: 3,
              padding: "0 4px",
              color: badgeColor,
              fontSize: 9,
            }}
          >
            {badgeVal}
          </span>
        )}
      </button>

      {/* Panel */}
      {visible && (
        <div
          style={{
            position: "fixed",
            bottom: 38,
            left: `min(${BTN_LEFT - 400}px, calc(100vw - 510px))`,
            width: 490,
            maxHeight: "78vh",
            overflowY: "auto",
            zIndex: 146,
            background: "rgba(5,10,18,0.97)",
            border: `1px solid ${CY}44`,
            borderRadius: 12,
            fontFamily: "'JetBrains Mono',monospace",
            boxShadow: `0 0 60px ${CY}18, 0 20px 40px rgba(0,0,0,0.8)`,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: `1px solid ${CY}33`,
            }}
          >
            <span style={{ color: CY, fontSize: 11, letterSpacing: 2 }}>
              ◎ ASSURANCE AUTOPILOT
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: GRAY, fontSize: 9 }}>◌</span>}
              <span
                style={{
                  fontSize: 9,
                  color: isOk ? GREEN : RED,
                  border: `1px solid ${isOk ? GREEN : RED}44`,
                  borderRadius: 3,
                  padding: "1px 5px",
                }}
              >
                {isOk ? "● OK" : "⚠ WARN"}
              </span>
              <button
                onClick={handleAssess}
                disabled={assessing || !status}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? GRAY : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !status ? "default" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {assessing ? "◌ ASSESSING" : "▶ ASSESS"}
              </button>
              <button
                onClick={() => setVisible(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: GRAY,
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          </div>

          {/* Stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
            <StatTile label="PROPOSALS"   value={propCount}  color={propCount > 0 ? AMBER : GREEN} />
            <StatTile label="NEXT ACTIONS" value={nextCount} color={nextCount > 0 ? CY : GRAY} />
            <StatTile label="SUBSYSTEMS"  value={sysCount}   color={PURP} />
            <StatTile label="STATUS"      value={isOk ? "OK" : "WARN"} color={isOk ? GREEN : RED} />
          </div>

          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              gap: 5,
              padding: "0 12px 8px",
              flexWrap: "wrap",
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {TABS.map((t) => (
              <Tab key={t} label={t} active={tab === t} onClick={() => setTab(t)} />
            ))}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                marginLeft: "auto",
                background: "rgba(41,231,255,0.06)",
                border: `1px solid ${CY}22`,
                borderRadius: 4,
                padding: "2px 8px",
                color: CY,
                fontSize: 9,
                fontFamily: "inherit",
                width: 90,
                outline: "none",
              }}
            />
          </div>

          {/* Assessment */}
          {assessment && (
            <div
              style={{
                margin: "8px 12px",
                padding: "7px 10px",
                background: `${CY}0A`,
                border: `1px solid ${CY}33`,
                borderRadius: 6,
                color: CY,
                fontSize: 9,
                lineHeight: 1.5,
              }}
            >
              {assessment}
            </div>
          )}

          {/* Loading state */}
          {!status && loading && (
            <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
              ◌ LOADING…
            </div>
          )}

          {/* Tab content */}
          {status && tab === "STATUS" && (
            <StatusTab status={status} search={search} />
          )}
          {roadmap && tab === "ROADMAP" && (
            <RoadmapTab roadmap={roadmap} search={search} />
          )}
          {tab === "PROPOSALS" && (
            <ProposalsTab
              proposals={proposals}
              search={search}
              onDecisionMade={loadAll}
            />
          )}
          {tab === "SUBSYSTEMS" && (
            <SubsystemsTab subsystems={subsystems} search={search} />
          )}
          {tab === "UNKNOWNS" && (
            <UnknownsTab unknowns={unknowns} search={search} />
          )}

          {/* Footer */}
          <div
            style={{
              padding: "5px 12px",
              borderTop: `1px solid ${CY}18`,
              display: "flex",
              justifyContent: "space-between",
              fontSize: 8,
              color: GRAY,
            }}
          >
            <span>ASSURANCE AUTOPILOT</span>
            <span>REFRESH 90s</span>
          </div>
        </div>
      )}
    </>
  );
}
