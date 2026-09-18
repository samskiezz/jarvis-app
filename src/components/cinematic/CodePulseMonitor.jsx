/**
 * CodePulseMonitor — F245.
 *
 * Data sources (real — backed by server/routes/codepulse.py):
 *   GET /v1/codepulse/status   every 60 s
 *       → {connected, workspace, pending_count, pending:[{id,type,status,...}], history_count}
 *   GET /v1/codepulse/pending  (on panel open + on each status poll)
 *       → {items:[{id,type,status,payload,created_at,resolved_at,reason}]}
 *   POST /v1/codepulse/pending/{id}/approve   → {ok}
 *   POST /v1/codepulse/pending/{id}/reject    (body: {reason}) → {ok}
 *   POST /v1/codepulse/pending/{id}/explain   → {ok, explanation}
 *
 * Displays:
 *   - Stat tiles: pending / approved / rejected / history
 *   - Connection status chip (workspace name or DISCONNECTED)
 *   - ALL / PENDING / APPROVED / REJECTED filter tabs + text search
 *   - Per-item row: type chip, status badge, created age, expand → approve/reject/explain
 *   - Explain → inline explanation block from backend
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence code-health brief + TTS
 *
 * Toggle: ⚙ CPLS at left:146640, bottom:8, zIndex:125.
 * Badge: red = any pending items; green = all quiet (no pending).
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isCplsQuery(q) / buildCplsScript()
 *
 * Voice triggers: "code pulse / approval queue / pending code / cpls /
 *   vs code bridge / code approvals / code changes / approve code /
 *   pending approvals / code queue / editor bridge"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RED  = "#F87171";
const DIM  = "#3A4A55";
const ORNG = "#FB923C";
const PUR  = "#A78BFA";

const BTN_LEFT   = 146640;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const CPLS_RE =
  /\b(code\s*pulse|approval\s*queue|pending\s*code|cpls|vs\s*code\s*bridge|code\s*approvals?|code\s*changes?|approve\s*code|pending\s*approvals?|code\s*queue|editor\s*bridge)\b/i;

export function isCplsQuery(t) {
  return CPLS_RE.test(t || "");
}

export async function buildCplsScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/codepulse/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const pending = d?.pending_count ?? 0;
    const hist    = d?.history_count ?? 0;
    const ws      = d?.workspace || null;
    const conn    = d?.connected ? `connected to ${ws || "workspace"}` : "disconnected";
    if (pending === 0 && hist === 0) {
      return `Code Pulse approval queue is empty — no pending or historical items. VS Code bridge is ${conn}.`;
    }
    return (
      `Code Pulse bridge is ${conn}: ${pending} item${pending !== 1 ? "s" : ""} pending approval, ` +
      `${hist} in history.` +
      (pending > 0 ? ` Immediate review recommended — ${pending} code change${pending !== 1 ? "s" : ""} awaiting sign-off.` : "")
    );
  } catch {
    return "Unable to reach Code Pulse approval queue at this time, sir.";
  }
}

// ─── fetch helpers ─────────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/codepulse/status`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchPending() {
  const r = await fetch(`${apiBase()}/v1/codepulse/pending`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postApprove(id) {
  const r = await fetch(`${apiBase()}/v1/codepulse/pending/${id}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
  });
  return r.json();
}

async function postReject(id, reason) {
  const r = await fetch(`${apiBase()}/v1/codepulse/pending/${id}/reject`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return r.json();
}

async function postExplain(id) {
  const r = await fetch(`${apiBase()}/v1/codepulse/pending/${id}/explain`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ question: "" }),
  });
  return r.json();
}

async function agentAssess(pending, hist, connected, workspace) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess the Code Pulse approval queue in 2 sentences: bridge is ${connected ? "connected to " + (workspace || "workspace") : "disconnected"}, ` +
        `${pending} items pending approval, ${hist} in history.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 72, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

const TYPE_COLOR = {
  edit:     CY,
  create:   GN,
  delete:   RED,
  shell:    ORNG,
  refactor: PUR,
  test:     AM,
  deploy:   "#F472B6",
};

const STATUS_COLOR = {
  pending:   AM,
  approved:  GN,
  rejected:  RED,
  explaining: PUR,
  completed: CY,
};

function typeColor(t) { return TYPE_COLOR[t]  || DIM; }
function statusColor(s) { return STATUS_COLOR[s] || DIM; }

function ageLabel(ts) {
  if (!ts) return "–";
  const diff = Date.now() / 1000 - new Date(ts).getTime() / 1000;
  if (diff < 60)   return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function ItemRow({ item, expanded, onToggle, onApprove, onReject, onExplain, actionBusy, explanation }) {
  const tc = typeColor(item.type);
  const sc = statusColor(item.status);
  const [rejectReason, setRejectReason] = useState("");
  const [showReject,   setShowReject]   = useState(false);
  const isPending = item.status === "pending";

  return (
    <div
      style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}11`,
        cursor: "pointer", background: expanded ? `${CY}06` : "transparent",
      }}
    >
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* type chip */}
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${tc}55`, color: tc, flexShrink: 0, fontFamily: "monospace",
        }}>
          {(item.type || "?").toUpperCase()}
        </span>
        {/* id excerpt */}
        <span style={{ flex: 1, fontSize: 9, color: "#C0D0DC", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.id?.slice(0, 14) || "—"}
        </span>
        {/* status */}
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${sc}55`, color: sc, flexShrink: 0,
        }}>
          {(item.status || "?").toUpperCase()}
        </span>
        {/* age */}
        <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>{ageLabel(item.created_at)}</span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div style={{
          marginTop: 8, padding: "8px 10px",
          background: `${CY}05`, borderRadius: 6, border: `1px solid ${CY}15`,
        }}>
          {/* payload excerpt */}
          {item.payload && (
            <pre style={{
              fontSize: 8, color: "#8899A6", marginBottom: 8, whiteSpace: "pre-wrap",
              wordBreak: "break-all", maxHeight: 64, overflow: "auto",
              background: `${DIM}22`, borderRadius: 4, padding: "4px 6px",
            }}>
              {JSON.stringify(item.payload, null, 2).slice(0, 400)}
            </pre>
          )}
          {/* reason */}
          {item.reason && (
            <div style={{ fontSize: 8, color: AM, marginBottom: 6 }}>
              Reason: {item.reason}
            </div>
          )}
          {/* explanation */}
          {explanation && (
            <div style={{
              fontSize: 8, color: PUR, marginBottom: 6,
              background: `${PUR}11`, borderRadius: 4, padding: "4px 6px",
            }}>
              {explanation}
            </div>
          )}
          {/* action buttons (only for pending items) */}
          {isPending && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                disabled={actionBusy}
                onClick={(e) => { e.stopPropagation(); onApprove(item.id); }}
                style={{
                  fontSize: 8, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${GN}77`, color: GN, background: `${GN}11`,
                  opacity: actionBusy ? 0.5 : 1,
                }}
              >
                ✓ APPROVE
              </button>
              <button
                disabled={actionBusy}
                onClick={(e) => { e.stopPropagation(); setShowReject((v) => !v); }}
                style={{
                  fontSize: 8, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${RED}77`, color: RED, background: `${RED}11`,
                  opacity: actionBusy ? 0.5 : 1,
                }}
              >
                ✕ REJECT
              </button>
              <button
                disabled={actionBusy}
                onClick={(e) => { e.stopPropagation(); onExplain(item.id); }}
                style={{
                  fontSize: 8, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${PUR}77`, color: PUR, background: `${PUR}11`,
                  opacity: actionBusy ? 0.5 : 1,
                }}
              >
                ▶ EXPLAIN
              </button>
            </div>
          )}
          {/* reject reason input */}
          {showReject && isPending && (
            <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason (optional)"
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1, fontSize: 8, padding: "3px 6px", borderRadius: 4,
                  border: `1px solid ${RED}44`, background: "#0A1A23", color: "#C0D0DC",
                  outline: "none",
                }}
              />
              <button
                disabled={actionBusy}
                onClick={(e) => { e.stopPropagation(); onReject(item.id, rejectReason); setShowReject(false); }}
                style={{
                  fontSize: 8, padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${RED}77`, color: RED, background: `${RED}11`,
                }}
              >
                Confirm
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "PENDING", "APPROVED", "REJECTED"];

// ─── main component ────────────────────────────────────────────────────────────

export default function CodePulseMonitor() {
  const [open,       setOpen]       = useState(false);
  const [status,     setStatus]     = useState(null);
  const [items,      setItems]      = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);
  const [busy,       setBusy]       = useState({});
  const [explanations, setExplanations] = useState({});

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, pd] = await Promise.all([fetchStatus(), fetchPending()]);
      setStatus(st);
      setItems(pd?.items || []);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(intervalRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((v) => !v);
    const onAsk = (e) => {
      const q = e?.detail?.text || e?.detail?.query || "";
      if (CPLS_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:cpls-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:cpls-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing || !status) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(
        status.pending_count ?? 0,
        status.history_count ?? 0,
        status.connected,
        status.workspace,
      );
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  async function handleApprove(id) {
    setBusy((b) => ({ ...b, [id]: true }));
    try { await postApprove(id); await load(); } catch (_) {}
    setBusy((b) => ({ ...b, [id]: false }));
  }

  async function handleReject(id, reason) {
    setBusy((b) => ({ ...b, [id]: true }));
    try { await postReject(id, reason); await load(); } catch (_) {}
    setBusy((b) => ({ ...b, [id]: false }));
  }

  async function handleExplain(id) {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const d = await postExplain(id);
      if (d?.explanation) {
        setExplanations((x) => ({ ...x, [id]: d.explanation }));
      }
    } catch (_) {}
    setBusy((b) => ({ ...b, [id]: false }));
  }

  // derived
  const pendingCnt  = items.filter((i) => i.status === "pending").length;
  const approvedCnt = items.filter((i) => i.status === "approved" || i.status === "completed").length;
  const rejectedCnt = items.filter((i) => i.status === "rejected").length;
  const histCnt     = status?.history_count ?? 0;
  const connected   = status?.connected ?? false;
  const workspace   = status?.workspace || null;

  const filtered = items.filter((i) => {
    if (tab === "PENDING"  && i.status !== "pending") return false;
    if (tab === "APPROVED" && i.status !== "approved" && i.status !== "completed") return false;
    if (tab === "REJECTED" && i.status !== "rejected") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (i.id || "").toLowerCase().includes(q) ||
        (i.type || "").toLowerCase().includes(q) ||
        (i.status || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  // badge
  const badgeColor = pendingCnt > 0 ? RED : GN;
  const badgeVal   = pendingCnt > 0 ? pendingCnt : items.length || null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 125,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ⚙ CPLS
        {badgeVal !== null && (
          <span style={{
            background: badgeColor, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeVal > 99 ? "9+" : badgeVal}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 260, bottom: 32, zIndex: 125,
      width: 300, maxHeight: 480,
      background: "rgba(6,16,24,0.97)", border: `1px solid ${CY}44`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      fontFamily: "monospace", boxShadow: `0 0 18px ${CY}22`,
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}22`,
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{ fontSize: 8, color: CY, letterSpacing: 2, fontWeight: 700, flex: 1 }}>
          ⚙ CODE PULSE MONITOR
        </span>
        {/* connection chip */}
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${connected ? GN : RED}55`,
          color: connected ? GN : RED,
          maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {connected ? (workspace || "CONNECTED") : "DISCONNECTED"}
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="PENDING"  value={pendingCnt}  color={pendingCnt > 0 ? RED : DIM} />
        <Tile label="APPROVED" value={approvedCnt} color={GN} />
        <Tile label="REJECTED" value={rejectedCnt} color={RED} />
        <Tile label="HISTORY"  value={histCnt}     color={CY} />
      </div>

      {/* assess */}
      <div style={{ padding: "0 12px 6px" }}>
        <button
          onClick={handleAssess}
          disabled={assessing}
          style={{
            width: "100%", fontSize: 8, padding: "4px 0", borderRadius: 5, cursor: "pointer",
            border: `1px solid ${CY}55`, color: CY, background: `${CY}0d`,
            opacity: assessing ? 0.6 : 1,
          }}
        >
          {assessing ? "▶ Assessing…" : "▶ ASSESS"}
        </button>
        {dossier && (
          <div style={{
            marginTop: 5, fontSize: 8, color: AM, lineHeight: 1.4,
            padding: "5px 7px", background: `${AM}0a`, borderRadius: 5,
          }}>
            {dossier}
          </div>
        )}
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, fontSize: 7, padding: "3px 0", borderRadius: 4, cursor: "pointer",
                border: `1px solid ${tab === t ? CY : DIM}55`,
                color: tab === t ? CY : DIM,
                background: tab === t ? `${CY}0d` : "transparent",
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search id / type / status…"
          style={{
            fontSize: 8, padding: "4px 8px", borderRadius: 4,
            border: `1px solid ${CY}22`, background: "#0A1A23", color: "#C0D0DC",
            outline: "none",
          }}
        />
      </div>

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
            {loading ? "Loading…" : "No items match current filter."}
          </div>
        ) : (
          filtered.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              expanded={expanded === item.id}
              onToggle={() => setExpanded((v) => (v === item.id ? null : item.id))}
              onApprove={handleApprove}
              onReject={handleReject}
              onExplain={handleExplain}
              actionBusy={!!busy[item.id]}
              explanation={explanations[item.id] || null}
            />
          ))
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{filtered.length}/{items.length} items</span>
        <span>60 s poll · /v1/codepulse</span>
      </div>
    </div>
  );
}
