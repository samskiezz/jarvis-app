/**
 * ClaudeCodeRunMonitor — F279.
 *
 * Monitors the Claude Code / whip session log.
 *
 * Data sources (all real — endpoints in /v1/claude_code):
 *   GET  /v1/claude_code/runs?limit=50&archived=1  (poll 60 s)
 *        → {ok, open, total, items:[{run_id,stage,label,model,status,archived,
 *             started,elapsed,bytes_out,outcome,detached}]}
 *   GET  /v1/claude_code/stats                     (mount + open)
 *        → {ok,total,open,archived,by_status,by_outcome,avg_elapsed_s}
 *   GET  /v1/claude_code/run/{run_id}              (lazy expand)
 *        → {status:{...}, heartbeat:{...}, prompt:"...", output:"..."}
 *   POST /v1/claude_code/archive/{run_id}          (archive button)
 *        → {ok:true}
 *
 * Displays:
 *   - Stat tiles: total / active / archived / avg elapsed
 *   - ACTIVE | ALL | ARCHIVED filter tabs + text search on label/stage
 *   - Per-run: status chip + label + elapsed chip + stage chip
 *   - Expand → prompt excerpt + output tail + outcome chip + model
 *   - ✕ ARCHIVE per active run
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence whip health brief + TTS
 *
 * Toggle: ◈ CLCD at left:292560, bottom:8, zIndex:157.
 * Badge: green=active run count, amber=any active, dim=empty.
 * Auto-refresh: 60 s.
 *
 * Exported helpers for JarvisBrain:
 *   isClcdQuery(q) / buildClcdScript()
 *
 * Voice triggers: "claude code / whip runs / code sessions / clcd /
 *   run monitor / active claude runs / what is claude doing /
 *   claude sessions / whip session / interactive runs / run history"
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

const BTN_LEFT = 292560;
const POLL_MS  = 60_000;
const API_KEY  =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const CLCD_RE =
  /\b(claude\s+code|whip\s+runs?|code\s+sessions?|clcd\b|run\s+monitor|active\s+claude\s+runs?|what(?:'s|\s+is)\s+claude\s+doing|claude\s+sessions?|whip\s+session|interactive\s+runs?|run\s+history)\b/i;

export function isClcdQuery(q) {
  return CLCD_RE.test(q || "");
}

export async function buildClcdScript() {
  try {
    const [runsR, statsR] = await Promise.all([
      fetch(`${apiBase()}/v1/claude_code/runs?limit=50&archived=1`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
      fetch(`${apiBase()}/v1/claude_code/stats`, {
        headers: { Authorization: `Bearer ${API_KEY}` },
      }),
    ]);
    const runs  = await runsR.json();
    const stats = await statsR.json();
    window.dispatchEvent(new CustomEvent("jarvis:clcd-toggle"));
    const active   = runs?.open ?? 0;
    const total    = stats?.total ?? 0;
    const avgEl    = stats?.avg_elapsed_s ?? 0;
    const byStatus = stats?.by_status ?? {};
    const statusSummary = Object.entries(byStatus)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");
    return (
      `Claude Code session log: ${active} active run${active !== 1 ? "s" : ""} of ${total} total` +
      (statusSummary ? ` (${statusSummary})` : "") +
      `, average runtime ${Math.round(avgEl / 60)} min. ` +
      (active > 0
        ? "Active sessions are live — open the panel to monitor output and archive completed runs."
        : "No active sessions. All runs are archived or completed.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:clcd-toggle"));
    return "Claude Code Run Monitor open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "number" ? (ts > 1e10 ? ts / 1000 : ts) : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function elapsed(s) {
  if (!s && s !== 0) return "—";
  const sec = Math.round(s);
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function fmtBytes(n) {
  if (!n) return "—";
  if (n < 1024)       return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(str, len = 300) {
  if (!str) return "";
  const s = typeof str === "string" ? str : JSON.stringify(str);
  return s.length > len ? s.slice(0, len) + "…" : s;
}

function statusColor(status) {
  if (status === "active" || status === "running") return GN;
  if (status === "queued")                         return AM;
  if (status === "done" || status === "complete")  return CY;
  if (status === "error" || status === "killed")   return RD;
  return GRAY;
}

function outcomeColor(outcome) {
  if (!outcome)                                              return GRAY;
  if (outcome === "success" || outcome === "done")           return GN;
  if (outcome === "timeout" || outcome === "idle_killed")    return AM;
  if (outcome === "manual_archive")                         return CY;
  if (outcome.includes("fail") || outcome.includes("error")) return RD;
  return PU;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchRuns() {
  const r = await fetch(`${apiBase()}/v1/claude_code/runs?limit=50&archived=1`, { headers: hdr() });
  if (!r.ok) throw new Error(`runs ${r.status}`);
  return r.json();
}

async function fetchStats() {
  const r = await fetch(`${apiBase()}/v1/claude_code/stats`, { headers: hdr() });
  if (!r.ok) throw new Error(`stats ${r.status}`);
  return r.json();
}

async function fetchRunDetail(runId) {
  const r = await fetch(`${apiBase()}/v1/claude_code/run/${runId}`, { headers: hdr() });
  if (!r.ok) throw new Error(`run/${runId} ${r.status}`);
  return r.json();
}

async function archiveRun(runId) {
  const r = await fetch(`${apiBase()}/v1/claude_code/archive/${runId}`, {
    method: "POST",
    headers: hdr(),
  });
  if (!r.ok) throw new Error(`archive ${r.status}`);
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
      <div style={{ color: GRAY, fontSize: 9, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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

function RunRow({ item, onArchive }) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [archiving, setArchiving] = useState(false);

  const status  = item?.status || item?.heartbeat?.state || "?";
  const isActive = status === "active" || status === "running" || status === "queued";

  async function expand() {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (!detail) {
      setLoading(true);
      try {
        const d = await fetchRunDetail(item.run_id);
        setDetail(d);
      } catch { /* leave null */ }
      setLoading(false);
    }
  }

  async function handleArchive(e) {
    e.stopPropagation();
    setArchiving(true);
    try {
      await archiveRun(item.run_id);
      onArchive(item.run_id);
    } catch { /* ignore */ }
    setArchiving(false);
  }

  const label   = item.label || item.stage || item.run_id;
  const elSec   = item.elapsed ?? detail?.heartbeat?.elapsed;
  const bytesOut = item.bytes_out ?? detail?.heartbeat?.bytes_out;

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
        <Chip label={status.toUpperCase()} color={statusColor(status)} />
        <span style={{ color: CY, fontSize: 11, fontFamily: "monospace", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
        {elSec != null && (
          <span style={{ color: GRAY, fontSize: 9, fontFamily: "monospace" }}>
            ⏱ {elapsed(elSec)}
          </span>
        )}
        {item.stage && item.stage !== label && (
          <Chip label={item.stage} color={PU} />
        )}
        {item.archived && <Chip label="archived" color={GRAY} />}
        {!item.archived && isActive && (
          <button
            onClick={handleArchive}
            disabled={archiving}
            style={{
              background: `${AM}11`,
              border: `1px solid ${AM}44`,
              borderRadius: 3,
              color: archiving ? GRAY : AM,
              cursor: archiving ? "wait" : "pointer",
              fontFamily: "monospace",
              fontSize: 9,
              padding: "1px 6px",
              flexShrink: 0,
            }}
          >
            {archiving ? "…" : "✕ ARCHIVE"}
          </button>
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
            <div style={{ color: GRAY, fontSize: 10 }}>Loading…</div>
          ) : detail ? (
            <>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                {detail.status?.outcome && (
                  <Chip label={`outcome: ${detail.status.outcome}`} color={outcomeColor(detail.status.outcome)} />
                )}
                {(item.model || detail.status?.model) && (
                  <Chip label={item.model || detail.status.model} color={PU} />
                )}
                {bytesOut != null && (
                  <Chip label={`out: ${fmtBytes(bytesOut)}`} color={GRAY} />
                )}
                <span style={{ color: GRAY, fontSize: 9 }}>{age(item.started)}</span>
              </div>
              {detail.prompt && (
                <div style={{ marginBottom: 5 }}>
                  <div style={{ color: GRAY, fontSize: 9, marginBottom: 2, textTransform: "uppercase" }}>prompt</div>
                  <pre style={{ color: CY, fontSize: 9, fontFamily: "monospace", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {truncate(detail.prompt, 250)}
                  </pre>
                </div>
              )}
              {detail.output && (
                <div>
                  <div style={{ color: GRAY, fontSize: 9, marginBottom: 2, textTransform: "uppercase" }}>output tail</div>
                  <pre style={{ color: GN, fontSize: 9, fontFamily: "monospace", margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {truncate(typeof detail.output === "string" ? detail.output.slice(-600) : detail.output, 600)}
                  </pre>
                </div>
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

export default function ClaudeCodeRunMonitor() {
  const [open, setOpen]       = useState(false);
  const [runs, setRuns]       = useState(null);
  const [stats, setStats]     = useState(null);
  const [tab, setTab]         = useState("ACTIVE");
  const [search, setSearch]   = useState("");
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const loadRuns = useCallback(async () => {
    try {
      const d = await fetchRuns();
      setRuns(d);
    } catch { /* keep stale */ }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const d = await fetchStats();
      setStats(d);
    } catch { /* keep stale */ }
  }, []);

  useEffect(() => {
    loadRuns();
    loadStats();
    timerRef.current = setInterval(loadRuns, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [loadRuns]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener("jarvis:clcd-toggle", toggle);
    return () => window.removeEventListener("jarvis:clcd-toggle", toggle);
  }, []);

  useEffect(() => {
    if (open) { loadRuns(); loadStats(); }
  }, [open, loadRuns, loadStats]);

  const items    = runs?.items ?? [];
  const activeN  = runs?.open ?? 0;
  const totalN   = stats?.total ?? runs?.total ?? 0;
  const archivedN = stats?.archived ?? 0;
  const avgEl    = stats?.avg_elapsed_s ?? 0;

  const filtered = items.filter((it) => {
    if (tab === "ACTIVE"   && (it.archived || (it.status !== "active" && it.status !== "running" && it.status !== "queued"))) return false;
    if (tab === "ARCHIVED" && !it.archived) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (it.label   || "").toLowerCase().includes(q) ||
      (it.stage   || "").toLowerCase().includes(q) ||
      (it.run_id  || "").toLowerCase().includes(q)
    );
  });

  function handleArchive(runId) {
    setRuns((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        open: Math.max(0, (prev.open ?? 0) - 1),
        items: prev.items.map((it) =>
          it.run_id === runId ? { ...it, archived: true, status: "done" } : it
        ),
      };
    });
  }

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const script = await buildClcdScript();
      setAssessText(script);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: script } }));
    } catch { setAssessText("Assessment unavailable."); }
    setAssessing(false);
  }

  // badge
  const badgeColor = activeN > 0 ? GN : DIM;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Claude Code Run Monitor"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 157,
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
        ◈ CLCD
        {activeN > 0 && (
          <span
            style={{
              background: `${GN}33`,
              border: `1px solid ${GN}`,
              borderRadius: 3,
              color: GN,
              fontSize: 8,
              padding: "0 3px",
            }}
          >
            {activeN}
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
        width: 440,
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
        <span style={{ color: CY, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>
          ◈ CLAUDE CODE RUNS
        </span>
        {activeN > 0 && (
          <span
            style={{
              background: `${GN}33`,
              border: `1px solid ${GN}`,
              borderRadius: 3,
              color: GN,
              fontSize: 9,
              padding: "1px 5px",
            }}
          >
            {activeN} active
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
        <StatTile label="total"    value={totalN}           color={CY} />
        <StatTile label="active"   value={activeN}          color={activeN > 0 ? GN : GRAY} />
        <StatTile label="archived" value={archivedN}        color={GRAY} />
        <StatTile label="avg time" value={elapsed(avgEl)}   color={AM} />
      </div>

      {/* tabs + search */}
      <div style={{ display: "flex", gap: 6, padding: "0 12px 8px", flexWrap: "wrap", alignItems: "center" }}>
        {["ACTIVE", "ALL", "ARCHIVED"].map((t) => {
          const countMap = { ACTIVE: activeN, ALL: totalN, ARCHIVED: archivedN };
          return (
            <TabBtn
              key={t}
              label={t}
              active={tab === t}
              count={countMap[t]}
              onClick={() => setTab(t)}
            />
          );
        })}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search label / stage…"
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
            minWidth: 120,
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

      {/* run list */}
      <div style={{ overflowY: "auto", flex: 1 }}>
        {filtered.length === 0 ? (
          <div style={{ color: GRAY, fontSize: 10, padding: "16px 12px", textAlign: "center" }}>
            {runs ? "No runs match." : "Loading…"}
          </div>
        ) : (
          filtered.map((it) => (
            <RunRow key={it.run_id} item={it} onArchive={handleArchive} />
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
        <span>{filtered.length}/{items.length} shown</span>
        <span>poll 60 s · /v1/claude_code</span>
      </div>
    </div>
  );
}
