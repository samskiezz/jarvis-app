/**
 * GovernedActionsPanel — F122
 * Shows the JARVIS AIP governed action registry and pending approval gates.
 * Real endpoints:
 *   GET /v1/jarvis/actions        → { actions: [{ name, permission, risk, layer, description }] }
 *   GET /v1/jarvis/approvals?status=pending&limit=30
 *                                 → { approvals: [{ id, ts, status, action, risk, params, actor }] }
 * Left-edge slide-in at 33% vertical. Violet (#7C3AED) accent.
 * Poll: actions 5 min, approvals 2 min.
 */
import { useState, useEffect, useRef } from "react";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

function apiBase() {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/$/, "");
  }
  return "";
}

const ACC = "#7C3AED";
const POLL_ACTIONS_MS = 5 * 60 * 1000;
const POLL_GATES_MS = 2 * 60 * 1000;

const RISK_COLOR = { low: "#22C55E", medium: "#F59E0B", high: "#EF4444" };
const LAYER_COLOR = {
  data: "#06B6D4",
  agent: "#A855F7",
  workflow: "#F97316",
  analytics: "#3B82F6",
  knowledge: "#10B981",
  system: "#94A3B8",
};

function relativeAge(ts) {
  if (!ts) return null;
  const d = typeof ts === "number" ? ts : new Date(ts).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function RiskBadge({ risk }) {
  const r = (risk || "medium").toLowerCase();
  const c = RISK_COLOR[r] || "#94A3B8";
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: 1,
        padding: "1px 5px",
        border: `1px solid ${c}55`,
        borderRadius: 4,
        color: c,
        background: `${c}11`,
        flexShrink: 0,
      }}
    >
      {r.toUpperCase()}
    </span>
  );
}

function LayerBadge({ layer }) {
  const l = (layer || "agent").toLowerCase();
  const c = LAYER_COLOR[l] || "#64748B";
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: 1,
        padding: "1px 5px",
        border: `1px solid ${c}44`,
        borderRadius: 4,
        color: c,
        background: `${c}11`,
        flexShrink: 0,
      }}
    >
      {l}
    </span>
  );
}

function ActionRow({ action }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        padding: "8px 14px",
        borderBottom: "1px solid #1E293B",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
        <span style={{ flex: 1, color: "#E2E8F0", fontSize: 11, fontWeight: 600 }}>
          {action.name}
        </span>
        <RiskBadge risk={action.risk} />
        <LayerBadge layer={action.layer} />
      </div>
      {action.description && (
        <div style={{ color: "#64748B", fontSize: 10, lineHeight: 1.4 }}>
          {action.description}
        </div>
      )}
      {expanded && (
        <div
          style={{
            marginTop: 6,
            fontSize: 9,
            color: "#475569",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <div>
            permission:{" "}
            <span style={{ color: "#7C3AED" }}>{action.permission || "—"}</span>
          </div>
          <div>
            layer:{" "}
            <span style={{ color: "#94A3B8" }}>{action.layer || "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function GateRow({ gate }) {
  const shortId = (gate.id || "").slice(0, 8);
  const age = relativeAge(gate.ts);
  return (
    <div
      style={{
        padding: "8px 14px",
        borderBottom: "1px solid #1E293B",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
        <span
          style={{
            fontSize: 9,
            color: "#475569",
            background: "#1E293B",
            padding: "1px 4px",
            borderRadius: 3,
            flexShrink: 0,
            fontFamily: "monospace",
          }}
        >
          {shortId}
        </span>
        <span style={{ flex: 1, color: "#E2E8F0", fontSize: 11, fontWeight: 600 }}>
          {gate.action || "—"}
        </span>
        <RiskBadge risk={gate.risk} />
      </div>
      <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#64748B" }}>
        {gate.actor && <span>actor: {gate.actor}</span>}
        {age && <span>{age}</span>}
      </div>
    </div>
  );
}

export default function GovernedActionsPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("actions");
  const [actions, setActions] = useState(null);
  const [gates, setGates] = useState(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingG, setLoadingG] = useState(false);
  const [errorA, setErrorA] = useState(null);
  const [errorG, setErrorG] = useState(null);
  const timerA = useRef(null);
  const timerG = useRef(null);

  async function fetchActions() {
    setLoadingA(true);
    setErrorA(null);
    try {
      const r = await fetch(`${apiBase()}/v1/jarvis/actions`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setActions(Array.isArray(d.actions) ? d.actions : []);
    } catch (e) {
      setErrorA(e.message || "fetch error");
    } finally {
      setLoadingA(false);
    }
  }

  async function fetchGates() {
    setLoadingG(true);
    setErrorG(null);
    try {
      const r = await fetch(
        `${apiBase()}/v1/jarvis/approvals?status=pending&limit=30`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setGates(Array.isArray(d.approvals) ? d.approvals : []);
    } catch (e) {
      setErrorG(e.message || "fetch error");
    } finally {
      setLoadingG(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchActions();
    fetchGates();
    timerA.current = setInterval(fetchActions, POLL_ACTIONS_MS);
    timerG.current = setInterval(fetchGates, POLL_GATES_MS);
    return () => {
      clearInterval(timerA.current);
      clearInterval(timerG.current);
    };
  }, [open]);

  const pendingCount = gates ? gates.length : 0;

  return (
    <>
      {/* Tab */}
      <div
        onClick={() => setOpen((o) => !o)}
        title="Governed AIP Actions"
        style={{
          position: "fixed",
          left: open ? 340 : 0,
          top: "33%",
          zIndex: 200,
          cursor: "pointer",
          background: "#0F172A",
          border: `1px solid ${ACC}44`,
          borderLeft: "none",
          borderRadius: "0 6px 6px 0",
          padding: "8px 6px",
          writingMode: "vertical-rl",
          fontSize: 10,
          letterSpacing: 1,
          color: ACC,
          userSelect: "none",
          transition: "left 0.25s",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
        }}
      >
        {pendingCount > 0 && (
          <span
            style={{
              fontSize: 8,
              background: "#EF4444",
              color: "#fff",
              borderRadius: "50%",
              width: 14,
              height: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              writingMode: "horizontal-tb",
            }}
          >
            {pendingCount}
          </span>
        )}
        <span>AIP ◀</span>
      </div>

      {/* Drawer */}
      <div
        style={{
          position: "fixed",
          left: open ? 0 : -340,
          top: "5%",
          width: 340,
          height: "90%",
          zIndex: 199,
          background: "rgba(15,23,42,0.97)",
          border: `1px solid ${ACC}33`,
          borderLeft: "none",
          borderRadius: "0 12px 12px 0",
          display: "flex",
          flexDirection: "column",
          transition: "left 0.25s",
          fontFamily: "monospace",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "10px 14px 8px",
            borderBottom: `1px solid ${ACC}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ color: ACC, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>
              ⚙ GOVERNED ACTIONS
            </div>
            <div style={{ color: "#64748B", fontSize: 9, marginTop: 2 }}>
              {actions === null ? "loading…" : `${actions.length} registered actions`}
              {pendingCount > 0 && (
                <span style={{ color: "#EF4444", marginLeft: 8 }}>
                  · {pendingCount} pending gate{pendingCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              background: "none",
              border: "none",
              color: "#475569",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: `1px solid ${ACC}22`,
            flexShrink: 0,
          }}
        >
          {["actions", "gates"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                background: tab === t ? `${ACC}22` : "none",
                border: "none",
                borderBottom: tab === t ? `2px solid ${ACC}` : "2px solid transparent",
                color: tab === t ? ACC : "#475569",
                fontSize: 10,
                letterSpacing: 1,
                padding: "6px 0",
                cursor: "pointer",
                fontFamily: "monospace",
                position: "relative",
              }}
            >
              {t === "actions"
                ? `ACTIONS ${actions !== null ? `(${actions.length})` : ""}`
                : `GATES ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
          {tab === "actions" && (
            <>
              {loadingA && actions === null && (
                <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
                  LOADING…
                </div>
              )}
              {errorA && (
                <div style={{ color: "#EF4444", fontSize: 10, padding: "8px 14px" }}>
                  ⚠ {errorA}
                </div>
              )}
              {actions !== null && actions.length === 0 && (
                <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
                  NO ACTIONS REGISTERED
                </div>
              )}
              {actions !== null && actions.map((a) => (
                <ActionRow key={a.name} action={a} />
              ))}
            </>
          )}

          {tab === "gates" && (
            <>
              {loadingG && gates === null && (
                <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
                  LOADING…
                </div>
              )}
              {errorG && (
                <div style={{ color: "#EF4444", fontSize: 10, padding: "8px 14px" }}>
                  ⚠ {errorG}
                </div>
              )}
              {gates !== null && gates.length === 0 && (
                <div style={{ color: "#475569", fontSize: 10, textAlign: "center", padding: 20 }}>
                  NO PENDING GATES
                </div>
              )}
              {gates !== null && gates.map((g) => (
                <GateRow key={g.id} gate={g} />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "6px 14px",
            borderTop: `1px solid ${ACC}22`,
            fontSize: 9,
            color: "#334155",
            flexShrink: 0,
          }}
        >
          ⚙ AIP registry · actions 5 min · gates 2 min · GET /v1/jarvis/actions
        </div>
      </div>
    </>
  );
}
