/**
 * RevDbBrowser — F257.
 *
 * Data sources (real — backed by server/routes/revdb.py):
 *   GET  /v1/revdb/history?limit=50
 *       → { count, items: [{id, message, actor, ts, changes:[...]}] }
 *   GET  /v1/revdb/branches
 *       → { count, items: [{name, commit_id, ts}] }
 *
 * Displays:
 *   - Stat tiles: total commits / branches / actors / latest actor
 *   - HISTORY|BRANCHES tab switcher + text search
 *   - HISTORY tab: per-commit message + actor chip + age; expand → change count + change list
 *   - BRANCHES tab: branch name + tip commit_id chip + age
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◬ RVDB at left:196800, bottom:8, zIndex:136.
 * Badge: amber = commit count.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isRevdbQuery(q) / buildRevdbScript()
 *
 * Voice triggers: "revision history / knowledge commits / revdb / rvdb /
 *   commit history / knowledge branches / revision log / knowledge revision /
 *   what changed / ontology history / brain commits / commit log / revision browser"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const AM  = "#F5A623";
const GN  = "#4ADE80";
const RED = "#F87171";
const DIM = "#3A4A55";
const PUR = "#A78BFA";

const BTN_LEFT   = 196800;
const REFRESH_MS = 90_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const RVDB_RE =
  /\b(revision history|knowledge commits?|revdb|rvdb|commit history|knowledge branches?|revision log|knowledge revision|what changed|ontology history|brain commits?|commit log|revision browser)\b/i;

export function isRevdbQuery(t) {
  return RVDB_RE.test(t || "");
}

export async function buildRevdbScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/revdb/history?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = Array.isArray(d.items) ? d.items : [];
    if (items.length === 0) {
      return "No revision history found. The knowledge revision database has no commits yet.";
    }
    const actors = new Set(items.map((i) => i.actor).filter(Boolean));
    const latest = items[0];
    return (
      `The knowledge revision database holds ${items.length} commit${items.length !== 1 ? "s" : ""} ` +
      `from ${actors.size} actor${actors.size !== 1 ? "s" : ""}. ` +
      `Latest commit by "${latest?.actor || "—"}": "${(latest?.message || "—").slice(0, 60)}".`
    );
  } catch {
    return "Unable to reach the revision database endpoint at this time.";
  }
}

// ─── fetch helpers ──────────────────────────────────────────────────────────

async function fetchHistory(limit = 50) {
  const r = await fetch(`${apiBase()}/v1/revdb/history?limit=${limit}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.items) ? d.items : [];
}

async function fetchBranches() {
  const r = await fetch(`${apiBase()}/v1/revdb/branches`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.items) ? d.items : [];
}

async function agentAssess(commitCount, branchCount) {
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess the knowledge revision database in 2 sentences: ` +
        `${commitCount} commit${commitCount !== 1 ? "s" : ""} recorded ` +
        `across ${branchCount} branch${branchCount !== 1 ? "es" : ""}. ` +
        `Identify the most operationally significant recent change.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ─────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 55, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 8px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{
        fontSize: 14, fontWeight: 700, color, letterSpacing: 1,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {value}
      </span>
    </div>
  );
}

function timeAgo(ts) {
  if (!ts) return "—";
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return `${Math.round(diff)}s`;
  if (diff < 3600)  return `${Math.round(diff / 60)}m`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

function Chip({ label, color }) {
  return (
    <span style={{
      fontSize: 7, padding: "1px 5px", borderRadius: 3,
      border: `1px solid ${color}55`, color, flexShrink: 0,
    }}>
      {label}
    </span>
  );
}

function CommitDetail({ commit }) {
  const changes = Array.isArray(commit.changes) ? commit.changes : [];
  return (
    <div style={{
      padding: "7px 14px", background: `${CY}06`,
      borderBottom: `1px solid ${CY}11`, fontSize: 7, lineHeight: 1.6,
    }}>
      <div style={{ color: DIM, marginBottom: 3, letterSpacing: 1 }}>
        CHANGES ({changes.length})
      </div>
      {changes.length === 0 && (
        <div style={{ color: DIM }}>No change details recorded.</div>
      )}
      {changes.slice(0, 6).map((ch, i) => {
        const op   = ch.op || ch.action || ch.type || "change";
        const kind = ch.object_type || ch.kind || ch.type || "";
        const oid  = ch.object_id  || ch.id   || "";
        const opColor = op === "create" ? GN : op === "delete" ? RED : AM;
        return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
            <Chip label={op.toUpperCase().slice(0, 6)} color={opColor} />
            {kind && <span style={{ color: CY }}>{kind}</span>}
            {oid && (
              <span style={{ color: "#C8D8E0", fontFamily: "monospace", flex: 1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {oid.slice(0, 24)}
              </span>
            )}
          </div>
        );
      })}
      {changes.length > 6 && (
        <div style={{ color: DIM, marginTop: 2 }}>+{changes.length - 6} more</div>
      )}
    </div>
  );
}

function CommitRow({ commit, expanded, onExpand }) {
  const actor = commit.actor || "system";
  return (
    <>
      <div
        onClick={() => onExpand(commit.id)}
        style={{
          padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
          display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer",
          background: expanded ? `${CY}07` : "transparent",
        }}
      >
        <span style={{
          flex: 1, fontSize: 8, color: "#C8D8E0",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {(commit.message || commit.id || "commit").slice(0, 40)}
        </span>
        <Chip label={actor.slice(0, 10)} color={PUR} />
        <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
          {timeAgo(commit.ts)}
        </span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && <CommitDetail commit={commit} />}
    </>
  );
}

function BranchRow({ branch }) {
  const tip = (branch.commit_id || "").slice(0, 12);
  return (
    <div style={{
      padding: "7px 12px", borderBottom: `1px solid ${CY}11`,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{
        flex: 1, fontSize: 8, color: GN, fontFamily: "monospace",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {branch.name || "—"}
      </span>
      {tip && <Chip label={tip} color={CY} />}
      <span style={{ fontSize: 7, color: DIM, flexShrink: 0 }}>
        {timeAgo(branch.ts)}
      </span>
    </div>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export default function RevDbBrowser() {
  const [open,       setOpen]       = useState(false);
  const [commits,    setCommits]    = useState([]);
  const [branches,   setBranches]   = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("HISTORY");
  const [search,     setSearch]     = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hist, brs] = await Promise.all([fetchHistory(50), fetchBranches()]);
      setCommits(hist);
      setBranches(brs);
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
      if (RVDB_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:rvdb-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:rvdb-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  function handleExpand(id) {
    setExpandedId((cur) => (cur === id ? null : id));
  }

  async function handleAssess() {
    if (assessing) return;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(commits.length, branches.length);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  // derived stats
  const actors    = new Set(commits.map((c) => c.actor).filter(Boolean));
  const latestAct = commits.length > 0 ? (commits[0].actor || "—") : "—";

  const filteredCommits = commits.filter((c) => {
    if (!search) return true;
    return (
      (c.message || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.actor   || "").toLowerCase().includes(search.toLowerCase())
    );
  });

  const filteredBranches = branches.filter((b) => {
    if (!search) return true;
    return (b.name || "").toLowerCase().includes(search.toLowerCase());
  });

  const badgeCount = commits.length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", left: BTN_LEFT, bottom: 8, zIndex: 136,
          background: "#091520", border: `1px solid ${CY}44`, borderRadius: 6,
          color: CY, fontSize: 7, padding: "3px 7px", cursor: "pointer",
          letterSpacing: 1, display: "flex", alignItems: "center", gap: 4,
          whiteSpace: "nowrap",
        }}
      >
        ◬ RVDB
        {badgeCount > 0 && (
          <span style={{
            background: AM, color: "#000", borderRadius: "50%",
            fontSize: 6, width: 12, height: 12, display: "flex",
            alignItems: "center", justifyContent: "center", fontWeight: 700,
          }}>
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: BTN_LEFT - 280, bottom: 32, zIndex: 136,
      width: 340, maxHeight: 540,
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
          ◬ KNOWLEDGE REVISION DB
        </span>
        {loading && <span style={{ fontSize: 8, color: DIM }}>↻</span>}
        <button onClick={() => setOpen(false)} style={{
          background: "none", border: "none", color: DIM,
          fontSize: 10, cursor: "pointer", lineHeight: 1,
        }}>✕</button>
      </div>

      {/* stat tiles */}
      <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
        <Tile label="COMMITS"  value={commits.length}  color={commits.length > 0 ? AM : DIM} />
        <Tile label="BRANCHES" value={branches.length} color={CY} />
        <Tile label="ACTORS"   value={actors.size}     color={GN} />
        <Tile label="LATEST"   value={latestAct.slice(0, 8)} color={PUR} />
      </div>

      {/* tabs + search */}
      <div style={{ padding: "0 12px 6px", display: "flex", gap: 4, alignItems: "center" }}>
        {["HISTORY", "BRANCHES"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 7, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
              border: `1px solid ${tab === t ? CY : CY + "33"}`,
              color: tab === t ? CY : DIM,
              background: tab === t ? `${CY}14` : "transparent",
            }}
          >
            {t}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tab === "HISTORY" ? "search commits…" : "search branches…"}
          style={{
            flex: 1, fontSize: 7, padding: "2px 6px", borderRadius: 4,
            background: "#0a1a24", border: `1px solid ${CY}22`, color: "#C8D8E0",
            outline: "none",
          }}
        />
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

      {/* list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "HISTORY" ? (
          filteredCommits.length === 0 ? (
            <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
              {loading ? "Loading…" : "No revision history found."}
            </div>
          ) : (
            filteredCommits.map((c) => (
              <CommitRow
                key={c.id || c.ts}
                commit={c}
                expanded={expandedId === c.id}
                onExpand={handleExpand}
              />
            ))
          )
        ) : (
          filteredBranches.length === 0 ? (
            <div style={{ fontSize: 8, color: DIM, padding: "12px 16px", textAlign: "center" }}>
              {loading ? "Loading…" : "No branches found."}
            </div>
          ) : (
            filteredBranches.map((b, i) => (
              <BranchRow key={b.name || i} branch={b} />
            ))
          )
        )}
      </div>

      {/* footer */}
      <div style={{
        padding: "5px 12px", borderTop: `1px solid ${CY}11`,
        fontSize: 7, color: DIM, display: "flex", justifyContent: "space-between",
      }}>
        <span>{tab === "HISTORY" ? filteredCommits.length : filteredBranches.length} shown</span>
        <span>90 s poll · /v1/revdb</span>
      </div>
    </div>
  );
}
