/**
 * ForgeAgentMonitor — F280.
 *
 * Monitors the APEX Forge autonomous code-improvement agent queue.
 *
 * Data sources (all real — endpoints in /v1/forge):
 *   GET  /v1/forge/status                         (poll 90 s)
 *        → {available, read_only, config:{model,ollama_url,branch_policy,test_gated},
 *             candidate_files, pending_approvals}
 *   GET  /v1/forge/approvals?status=pending        (poll 60 s on open)
 *        → {items:[{id,path,status,created_at,by,diff_lines}], available}
 *   GET  /v1/forge/approvals/{change_id}           (lazy expand)
 *        → {id,path,status,created_at,by,diff_lines,diff}
 *   POST /v1/forge/approvals/{change_id}/approve   (approve button)
 *        → {ok:true, change:{...}}
 *   POST /v1/forge/approvals/{change_id}/reject    (reject button)
 *        → {ok:true, change:{...}}
 *
 * Displays:
 *   - Stat tiles: candidate files / pending / approved / rejected
 *   - Forge config chip row (model / branch-policy / test-gated)
 *   - ALL | PENDING | APPROVED | REJECTED filter tabs + path search
 *   - Per-change: status chip + path + diff-lines chip + age
 *   - Expand → full diff (first 800 chars) + ✓ APPROVE / ✗ REJECT buttons
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence forge brief + TTS
 *
 * Toggle: ◈ FRGM at left:297120, bottom:8, zIndex:158.
 * Badge: amber=pending count, green=available+no-pending, dim=not available.
 * Auto-refresh: status 90 s, approvals 60 s (when open).
 *
 * Exported helpers for JarvisBrain:
 *   isFrgmQuery(q) / buildFrgmScript()
 *
 * Voice triggers: "forge agent / forge approvals / code forge / forge queue /
 *   frgm / pending code changes / forge diff / approve forge / forge monitor /
 *   code improvement / forge pipeline / autonomous forge / forge status"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const RD   = "#F87171";
const PU   = "#A78BFA";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT   = 297120;
const POLL_MS    = 90_000;
const POLL_APR   = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const FRGM_RE =
  /\b(forge\s+agent|forge\s+approvals?|code\s+forge|forge\s+queue|frgm\b|pending\s+code\s+changes?|forge\s+diff|approve\s+forge|forge\s+monitor|code\s+improvement|forge\s+pipeline|autonomous\s+forge|forge\s+status)\b/i;

export function isFrgmQuery(q) {
  return FRGM_RE.test(q || "");
}

export async function buildFrgmScript() {
  try {
    const [statusR, apprR] = await Promise.all([
      fetch(`${apiBase()}/v1/forge/status`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/forge/approvals`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const status = await statusR.json();
    const appr   = await apprR.json();
    window.dispatchEvent(new CustomEvent("jarvis:frgm-toggle"));
    const pending   = status?.pending_approvals ?? 0;
    const available = status?.available ?? false;
    const model     = status?.config?.model ?? "unknown";
    const candidates = status?.candidate_files ?? 0;
    const items      = appr?.items ?? [];
    const approved   = items.filter((i) => i.status === "approved").length;
    const rejected   = items.filter((i) => i.status === "rejected").length;
    return (
      `Forge code-improvement agent: ${available ? "online" : "offline"}, ` +
      `model ${model}, ${candidates} candidate file${candidates !== 1 ? "s" : ""}, ` +
      `${pending} pending approval${pending !== 1 ? "s" : ""}` +
      (approved || rejected
        ? `, ${approved} approved and ${rejected} rejected in queue`
        : "") +
      ". " +
      (pending > 0
        ? `Open the panel to review and approve or reject queued code changes.`
        : available
        ? "Queue is clear — no pending forge changes."
        : "Forge agent is not reachable in this environment.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:frgm-toggle"));
    return "Forge Agent Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function age(ts) {
  if (!ts) return "—";
  const raw =
    typeof ts === "number"
      ? ts > 1e10
        ? ts / 1000
        : ts
      : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function statusColor(status) {
  if (status === "pending")  return AM;
  if (status === "approved") return GN;
  if (status === "rejected") return RD;
  return GRAY;
}

function truncate(str, len = 800) {
  if (!str) return "";
  const s = typeof str === "string" ? str : JSON.stringify(str);
  return s.length > len ? s.slice(0, len) + "\n…" : s;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchStatus() {
  const r = await fetch(`${apiBase()}/v1/forge/status`, { headers: hdr() });
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

async function fetchApprovals() {
  const r = await fetch(`${apiBase()}/v1/forge/approvals`, { headers: hdr() });
  if (!r.ok) throw new Error(`approvals ${r.status}`);
  return r.json();
}

async function fetchChange(changeId) {
  const r = await fetch(`${apiBase()}/v1/forge/approvals/${changeId}`, { headers: hdr() });
  if (!r.ok) throw new Error(`change ${r.status}`);
  return r.json();
}

async function postApprove(changeId) {
  const r = await fetch(`${apiBase()}/v1/forge/approvals/${changeId}/approve`, {
    method: "POST",
    headers: hdr(),
  });
  if (!r.ok) throw new Error(`approve ${r.status}`);
  return r.json();
}

async function postReject(changeId) {
  const r = await fetch(`${apiBase()}/v1/forge/approvals/${changeId}/reject`, {
    method: "POST",
    headers: hdr(),
  });
  if (!r.ok) throw new Error(`reject ${r.status}`);
  return r.json();
}

// ─── sub-components ───────────────────────────────────────────────────────────

function StatTile({ label, value, color }) {
  return (
    <div
      style={{
        flex: 1,
        background: "rgba(41,231,255,0.04)",
        border: "1px solid rgba(41,231,255,0.10)",
        borderRadius: 6,
        padding: "8px 10px",
        minWidth: 60,
      }}
    >
      <div style={{ color, fontSize: 16, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      <div
        style={{
          color: GRAY,
          fontSize: 9,
          marginTop: 3,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function TabBtn({ label, active, count, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "rgba(41,231,255,0.12)" : "transparent",
        border: `1px solid ${active ? CY : "rgba(41,231,255,0.15)"}`,
        borderRadius: 4,
        color: active ? CY : GRAY,
        cursor: "pointer",
        fontSize: 10,
        fontFamily: "monospace",
        letterSpacing: "0.06em",
        padding: "3px 8px",
        display: "flex",
        alignItems: "center",
        gap: 4,
      }}
    >
      {label}
      {count != null && (
        <span
          style={{
            background: count > 0 ? `${AM}33` : `${DIM}55`,
            border: `1px solid ${count > 0 ? AM : DIM}`,
            borderRadius: 3,
            color: count > 0 ? AM : GRAY,
            fontSize: 9,
            padding: "0 3px",
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({ label, color }) {
  return (
    <span
      style={{
        background: `${color}22`,
        border: `1px solid ${color}55`,
        borderRadius: 3,
        color,
        fontSize: 9,
        fontFamily: "monospace",
        padding: "1px 5px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ChangeRow({ item, onStatusChange }) {
  const [expanded, setExpanded]   = useState(false);
  const [detail, setDetail]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [acting, setActing]       = useState(null);
  const [localStatus, setLocalStatus] = useState(item?.status);

  async function expand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const d = await fetchChange(item.id);
        setDetail(d);
      } catch { /* leave null */ }
      setLoading(false);
    }
  }

  async function handleApprove(e) {
    e.stopPropagation();
    setActing("approve");
    try {
      await postApprove(item.id);
      setLocalStatus("approved");
      onStatusChange(item.id, "approved");
    } catch { /* keep state */ }
    setActing(null);
  }

  async function handleReject(e) {
    e.stopPropagation();
    setActing("reject");
    try {
      await postReject(item.id);
      setLocalStatus("rejected");
      onStatusChange(item.id, "rejected");
    } catch { /* keep state */ }
    setActing(null);
  }

  const isPending = (localStatus || item?.status) === "pending";
  const path      = item?.path ?? item?.id ?? "?";
  const diffLines = item?.diff_lines ?? detail?.diff_lines;

  return (
    <div
      style={{
        borderBottom: "1px solid rgba(41,231,255,0.07)",
        padding: "6px 8px",
        cursor: "pointer",
      }}
    >
      <div
        onClick={expand}
        style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      >
        <Chip
          label={(localStatus || item?.status || "?").toUpperCase()}
          color={statusColor(localStatus || item?.status)}
        />
        <span
          style={{
            color: CY,
            fontSize: 11,
            fontFamily: "monospace",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {path}
        </span>
        {diffLines != null && (
          <Chip label={`${diffLines} lines`} color={PU} />
        )}
        <span style={{ color: GRAY, fontSize: 9 }}>{age(item?.created_at)}</span>
        {isPending && (
          <>
            <button
              onClick={handleApprove}
              disabled={!!acting}
              style={{
                background: `${GN}11`,
                border: `1px solid ${GN}44`,
                borderRadius: 3,
                color: acting === "approve" ? GRAY : GN,
                cursor: acting ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 9,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              {acting === "approve" ? "…" : "✓ APPROVE"}
            </button>
            <button
              onClick={handleReject}
              disabled={!!acting}
              style={{
                background: `${RD}11`,
                border: `1px solid ${RD}44`,
                borderRadius: 3,
                color: acting === "reject" ? GRAY : RD,
                cursor: acting ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 9,
                padding: "1px 6px",
                flexShrink: 0,
              }}
            >
              {acting === "reject" ? "…" : "✗ REJECT"}
            </button>
          </>
        )}
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div
          style={{
            background: "rgba(0,0,0,0.18)",
            borderRadius: 4,
            marginTop: 6,
            padding: "7px 9px",
          }}
        >
          {loading ? (
            <div style={{ color: GRAY, fontSize: 10 }}>Loading diff…</div>
          ) : detail ? (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {detail.by && <Chip label={`by: ${detail.by}`} color={CY} />}
                {detail.diff_lines != null && (
                  <Chip label={`${detail.diff_lines} diff lines`} color={PU} />
                )}
              </div>
              {detail.diff ? (
                <div>
                  <div
                    style={{
                      color: GRAY,
                      fontSize: 9,
                      marginBottom: 4,
                      textTransform: "uppercase",
                    }}
                  >
                    diff preview
                  </div>
                  <pre
                    style={{
                      color: GN,
                      fontSize: 9,
                      fontFamily: "monospace",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {truncate(detail.diff, 800)}
                  </pre>
                </div>
              ) : (
                <div style={{ color: GRAY, fontSize: 10 }}>No diff available.</div>
              )}
            </>
          ) : (
            <div style={{ color: GRAY, fontSize: 10 }}>Detail unavailable.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function ForgeAgentMonitor() {
  const [open, setOpen]         = useState(false);
  const [status, setStatus]     = useState(null);
  const [approvals, setApprovals] = useState(null);
  const [tab, setTab]           = useState("PENDING");
  const [search, setSearch]     = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const statusTimer  = useRef(null);
  const apprTimer    = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const d = await fetchStatus();
      setStatus(d);
    } catch { /* keep stale */ }
  }, []);

  const loadApprovals = useCallback(async () => {
    try {
      const d = await fetchApprovals();
      setApprovals(d);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    loadStatus();
    statusTimer.current = setInterval(loadStatus, POLL_MS);
    return () => clearInterval(statusTimer.current);
  }, [loadStatus]);

  useEffect(() => {
    if (!open) return;
    loadApprovals();
    apprTimer.current = setInterval(loadApprovals, POLL_APR);
    return () => clearInterval(apprTimer.current);
  }, [open, loadApprovals]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:frgm-toggle", toggle);
    return () => window.removeEventListener("jarvis:frgm-toggle", toggle);
  }, []);

  const items    = approvals?.items ?? [];
  const pending  = items.filter((i) => i.status === "pending").length;
  const approved = items.filter((i) => i.status === "approved").length;
  const rejected = items.filter((i) => i.status === "rejected").length;
  const candidates = status?.candidate_files ?? "—";
  const isAvailable = status?.available ?? false;
  const model      = status?.config?.model ?? null;

  function handleStatusChange(changeId, newStatus) {
    setApprovals((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((it) =>
          it.id === changeId ? { ...it, status: newStatus } : it
        ),
      };
    });
  }

  const filtered = items.filter((it) => {
    if (tab === "PENDING"  && it.status !== "pending")  return false;
    if (tab === "APPROVED" && it.status !== "approved") return false;
    if (tab === "REJECTED" && it.status !== "rejected") return false;
    if (!search) return true;
    return (it.path || "").toLowerCase().includes(search.toLowerCase());
  });

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildFrgmScript();
      setAssessText(script);
      window.dispatchEvent(
        new CustomEvent("jarvis:speak-dossier", { detail: { text: script } })
      );
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  }

  const badgeColor = !isAvailable
    ? DIM
    : pending > 0
    ? AM
    : GN;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Forge Agent Monitor"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 158,
          background: "rgba(10,18,24,0.85)",
          border: `1px solid ${badgeColor}55`,
          borderRadius: 4,
          color: badgeColor,
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 9,
          letterSpacing: "0.07em",
          padding: "3px 7px",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        ◈ FRGM
        {pending > 0 && (
          <span
            style={{
              background: `${AM}33`,
              border: `1px solid ${AM}`,
              borderRadius: 3,
              color: AM,
              fontSize: 8,
              padding: "0 3px",
            }}
          >
            {pending}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        left: 8,
        bottom: 40,
        zIndex: 9200,
        background: "rgba(6,14,20,0.97)",
        border: `1px solid ${CY}33`,
        borderRadius: 10,
        boxShadow: `0 0 32px ${CY}18`,
        width: 460,
        maxHeight: "72vh",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        overflow: "hidden",
      }}
    >
      {/* header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          borderBottom: `1px solid ${CY}22`,
          padding: "8px 12px",
          gap: 8,
        }}
      >
        <span
          style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}
        >
          ◈ FORGE AGENT
        </span>
        <Chip
          label={isAvailable ? "ONLINE" : "OFFLINE"}
          color={isAvailable ? GN : DIM}
        />
        {pending > 0 && (
          <span
            style={{
              background: `${AM}33`,
              border: `1px solid ${AM}`,
              borderRadius: 3,
              color: AM,
              fontSize: 9,
              padding: "1px 5px",
            }}
          >
            {pending} pending
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={assess}
          disabled={assessing}
          style={{
            background: `${CY}11`,
            border: `1px solid ${CY}44`,
            borderRadius: 3,
            color: assessing ? GRAY : CY,
            cursor: assessing ? "wait" : "pointer",
            fontSize: 9,
            padding: "2px 7px",
          }}
        >
          {assessing ? "…" : "▶ ASSESS"}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "transparent",
            border: "none",
            color: GRAY,
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          ×
        </button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <StatTile label="candidates" value={candidates}  color={CY}  />
        <StatTile label="pending"    value={pending}     color={pending > 0 ? AM : GRAY} />
        <StatTile label="approved"   value={approved}    color={GN}  />
        <StatTile label="rejected"   value={rejected}    color={RD}  />
      </div>

      {/* forge config chips */}
      {status?.config && (
        <div
          style={{
            display: "flex",
            gap: 5,
            padding: "0 12px 8px",
            flexWrap: "wrap",
          }}
        >
          {model && <Chip label={`model: ${model}`} color={PU} />}
          {status.config.branch_policy && (
            <Chip label={status.config.branch_policy} color={GRAY} />
          )}
          <Chip
            label={status.config.test_gated ? "test-gated" : "no-tests"}
            color={status.config.test_gated ? GN : AM}
          />
        </div>
      )}

      {/* tabs + search */}
      <div
        style={{
          display: "flex",
          gap: 6,
          padding: "0 12px 8px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {[
          { key: "PENDING",  count: pending  },
          { key: "APPROVED", count: approved },
          { key: "REJECTED", count: rejected },
          { key: "ALL",      count: items.length },
        ].map(({ key, count }) => (
          <TabBtn
            key={key}
            label={key}
            active={tab === key}
            count={count}
            onClick={() => setTab(key)}
          />
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search path…"
          style={{
            background: "rgba(41,231,255,0.05)",
            border: "1px solid rgba(41,231,255,0.15)",
            borderRadius: 4,
            color: CY,
            fontFamily: "monospace",
            fontSize: 10,
            outline: "none",
            padding: "3px 8px",
            flex: 1,
            minWidth: 100,
          }}
        />
      </div>

      {/* assess text */}
      {assessText && (
        <div
          style={{
            background: "rgba(41,231,255,0.06)",
            borderTop: `1px solid ${CY}22`,
            color: CY,
            fontSize: 10,
            lineHeight: 1.5,
            padding: "7px 12px",
          }}
        >
          {assessText}
        </div>
      )}

      {/* change list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {!open ? null : approvals === null ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            {items.length === 0 ? "No changes in queue." : "No changes match."}
          </div>
        ) : (
          filtered.map((it) => (
            <ChangeRow key={it.id} item={it} onStatusChange={handleStatusChange} />
          ))
        )}
      </div>

      {/* footer */}
      <div
        style={{
          borderTop: `1px solid ${CY}22`,
          color: GRAY,
          fontSize: 9,
          padding: "5px 12px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>
          {filtered.length}/{items.length} shown
        </span>
        <span>status 90 s · approvals 60 s · /v1/forge</span>
      </div>
    </div>
  );
}
