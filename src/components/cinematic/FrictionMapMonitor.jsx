/**
 * FrictionMapMonitor — F248.
 *
 * Data sources (all real — backed by server/routes/friction_map.py):
 *   GET /v1/friction/scan?hours=24
 *       → {hours, score, findings:[{kind, label, count, suggestion}],
 *          action_summary:{action:count}}
 *   POST /v1/friction/log  {action, detail}  → {ok}
 *
 * Displays:
 *   - Stat tiles: friction score / total findings / repeated-actions / repeat-errors
 *   - ALL / REPEATED_ACTION / DUPLICATE_PROMPT / REPEAT_ERROR filter tabs + text search
 *   - Expand finding → suggestion text + count badge
 *   - Action summary top-10 bar chart
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence friction brief + TTS
 *
 * Toggle: ⚡ FRIC at left:160320, bottom:8, zIndex:128.
 * Badge: amber = any findings; number = friction score.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isFricQuery(q) / buildFricScript()
 *
 * Voice triggers: "friction map / workflow friction / repeated actions /
 *   friction score / repeated errors / fric / workflow pain / action bottleneck /
 *   duplicate prompts / friction analysis / what keeps slowing me down"
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
const OR  = "#FB923C";

const BTN_LEFT   = 160320;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const FRIC_RE =
  /\b(friction\s*map|workflow\s*friction|repeated\s*actions?|friction\s*score|repeat(?:ed)?\s*errors?|fric\b|workflow\s*pain|action\s*bottleneck|duplicate\s*prompts?|friction\s*analysis|what\s*keeps\s*slowing\s*(?:me\s*)?down|repeated\s*mistakes?)\b/i;

export function isFricQuery(t) {
  return FRIC_RE.test(t || "");
}

export async function buildFricScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/friction/scan?hours=24`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const findings = d?.findings || [];
    const score    = d?.score ?? 0;
    if (findings.length === 0) {
      return `Friction score is ${score}/100 — no repeated friction patterns detected in the last 24 hours. Workflow is clean.`;
    }
    const acts  = findings.filter((f) => f.kind === "repeated_action").length;
    const errs  = findings.filter((f) => f.kind === "repeat_error").length;
    const dupes = findings.filter((f) => f.kind === "duplicate_prompt").length;
    const top   = findings.slice(0, 2).map((f) => f.label).join("; ");
    return (
      `Friction score ${score}/100 — ${findings.length} pattern${findings.length !== 1 ? "s" : ""} detected: ` +
      `${acts} repeated action${acts !== 1 ? "s" : ""}, ${errs} repeat error${errs !== 1 ? "s" : ""}, ` +
      `${dupes} duplicate prompt${dupes !== 1 ? "s" : ""}. ` +
      (top ? `Top friction: ${top}.` : "")
    );
  } catch {
    return "Unable to retrieve friction map data at this time, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const KIND_LABEL = {
  repeated_action:  "REPEATED ACTION",
  duplicate_prompt: "DUPLICATE PROMPT",
  repeat_error:     "REPEAT ERROR",
};

const KIND_COLOR = {
  repeated_action:  AM,
  duplicate_prompt: OR,
  repeat_error:     RED,
};

function kindColor(k) { return KIND_COLOR[k] || DIM; }

function scoreColor(s) {
  if (s >= 70) return RED;
  if (s >= 40) return AM;
  return GN;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchScan(hours = 24) {
  const r = await fetch(`${apiBase()}/v1/friction/scan?hours=${hours}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(score, findings) {
  const top = findings.slice(0, 3).map((f) => `${f.label} (×${f.count})`).join("; ");
  const prompt =
    `Friction score ${score}/100. Top friction patterns: ${top || "none"}. ` +
    `Total findings: ${findings.length}. Give a 2-sentence operational brief: ` +
    `what is causing the most friction and the single most impactful fix. Be direct and specific.`;
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ message: prompt }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "Assessment unavailable.";
}

// ─── stat tile ────────────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: "1 1 70px", padding: "8px 10px",
      background: `${color}0d`, border: `1px solid ${color}33`,
      borderRadius: 8, textAlign: "center",
    }}>
      <div style={{ fontSize: 7, color: DIM, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ─── finding row ──────────────────────────────────────────────────────────────

function FindingRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const kc = kindColor(item.kind);

  return (
    <div
      onClick={() => setExpanded((e) => !e)}
      style={{
        padding: "7px 10px", marginBottom: 4, cursor: "pointer",
        background: expanded ? `${kc}12` : "rgba(255,255,255,0.02)",
        border: `1px solid ${expanded ? kc + "66" : "#ffffff0d"}`,
        borderRadius: 7, transition: "background 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontSize: 8, fontWeight: 700, color: kc,
          background: `${kc}22`, padding: "2px 5px", borderRadius: 4,
          letterSpacing: 0.5, flexShrink: 0,
        }}>
          {KIND_LABEL[item.kind] || item.kind?.toUpperCase()}
        </span>
        <span style={{ fontSize: 11, color: "#cdd6e0", flex: 1, minWidth: 0 }}>
          {item.label}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: kc,
          background: `${kc}22`, padding: "1px 6px", borderRadius: 10,
          flexShrink: 0,
        }}>
          ×{item.count}
        </span>
        <span style={{ fontSize: 9, color: DIM, flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {expanded && (
        <div style={{
          marginTop: 8, padding: "6px 8px",
          background: "rgba(0,0,0,0.25)", borderRadius: 5,
          fontSize: 10, color: "#8ea8b8", lineHeight: 1.5,
        }}>
          <span style={{ color: GN, fontWeight: 600 }}>Suggestion: </span>
          {item.suggestion || "No suggestion available."}
        </div>
      )}
    </div>
  );
}

// ─── action summary bar chart ─────────────────────────────────────────────────

function ActionSummary({ summary }) {
  const entries = Object.entries(summary || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (entries.length === 0) return null;
  const max = entries[0][1] || 1;

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 8, color: DIM, letterSpacing: 1, marginBottom: 6, textTransform: "uppercase" }}>
        Action Summary (24h)
      </div>
      {entries.map(([action, count]) => (
        <div key={action} style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#8ea8b8", marginBottom: 2 }}>
            <span style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {action}
            </span>
            <span style={{ color: CY, fontWeight: 600 }}>{count}</span>
          </div>
          <div style={{ height: 4, background: "#1a2a35", borderRadius: 2 }}>
            <div style={{
              height: 4, borderRadius: 2,
              width: `${(count / max) * 100}%`,
              background: `linear-gradient(90deg, ${CY}, ${CY}88)`,
              transition: "width 0.3s",
            }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function FrictionMapMonitor() {
  const [open,      setOpen]      = useState(false);
  const [data,      setData]      = useState(null);
  const [err,       setErr]       = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState("ALL");
  const [search,    setSearch]    = useState("");
  const [assessing, setAssessing] = useState(false);
  const [brief,     setBrief]     = useState(null);

  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchScan(24);
      setData(d);
      setErr(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const toggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:fric-toggle", toggle);
    return () => window.removeEventListener("jarvis:fric-toggle", toggle);
  }, []);

  const findings = data?.findings || [];
  const summary  = data?.action_summary || {};
  const score    = data?.score ?? 0;

  const acts  = findings.filter((f) => f.kind === "repeated_action").length;
  const dupes = findings.filter((f) => f.kind === "duplicate_prompt").length;
  const errs  = findings.filter((f) => f.kind === "repeat_error").length;

  const visible = findings.filter((f) => {
    if (filter === "REPEATED_ACTION"  && f.kind !== "repeated_action")  return false;
    if (filter === "DUPLICATE_PROMPT" && f.kind !== "duplicate_prompt") return false;
    if (filter === "REPEAT_ERROR"     && f.kind !== "repeat_error")     return false;
    if (search && !f.label?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const badgeVal   = findings.length > 0 ? score : null;
  const badgeColor = findings.length > 0 ? AM : GN;

  async function handleAssess() {
    setAssessing(true); setBrief(null);
    try {
      const text = await agentAssess(score, findings);
      setBrief(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setBrief("Assessment failed — check agent connectivity.");
    }
    setAssessing(false);
  }

  const sc = scoreColor(score);

  return (
    <>
      {/* ─── dock button ─────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Friction Map Monitor"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT,
          zIndex: 128, transform: "translateX(-50%)",
          background: open ? `${AM}22` : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? AM : "#ffffff22"}`,
          borderRadius: 7, padding: "4px 8px",
          color: open ? AM : "#8ea8b8", fontSize: 9, fontWeight: 700,
          cursor: "pointer", letterSpacing: 0.5, display: "flex",
          alignItems: "center", gap: 4, backdropFilter: "blur(6px)",
          transition: "all 0.2s",
        }}
      >
        ⚡ FRIC
        {badgeVal !== null && (
          <span style={{
            background: badgeColor, color: "#000", fontSize: 8,
            borderRadius: 8, padding: "1px 4px", fontWeight: 700,
          }}>
            {badgeVal}
          </span>
        )}
      </button>

      {/* ─── panel ───────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", bottom: 36, left: BTN_LEFT,
          transform: "translateX(-50%)", zIndex: 129,
          width: 420, maxHeight: "70vh",
          background: "rgba(5,12,20,0.97)",
          border: `1px solid ${AM}44`,
          borderRadius: 12, overflow: "hidden", display: "flex",
          flexDirection: "column", backdropFilter: "blur(20px)",
          boxShadow: `0 0 30px ${AM}22`,
        }}>
          {/* header */}
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid #ffffff0d`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: AM, fontSize: 13, fontWeight: 700 }}>⚡</span>
            <span style={{ color: AM, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
              FRICTION MAP
            </span>
            <span style={{ flex: 1 }} />
            {loading && (
              <span style={{ fontSize: 8, color: DIM }}>LOADING…</span>
            )}
            <button
              onClick={() => { setLoading(true); load(); }}
              style={{ background: "none", border: "none", color: DIM, fontSize: 11, cursor: "pointer" }}
            >↺</button>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer" }}
            >✕</button>
          </div>

          {err && (
            <div style={{ padding: "8px 14px", color: RED, fontSize: 10 }}>
              ⚠ {err}
            </div>
          )}

          {/* stat tiles */}
          <div style={{ padding: "10px 14px 0", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Tile label="FRICTION SCORE" value={score} color={sc} />
            <Tile label="FINDINGS"       value={findings.length} color={findings.length ? AM : GN} />
            <Tile label="REPEAT ACTIONS" value={acts}  color={acts  ? OR  : DIM} />
            <Tile label="REPEAT ERRORS"  value={errs}  color={errs  ? RED : DIM} />
          </div>

          {/* filter tabs */}
          <div style={{
            display: "flex", gap: 4, padding: "8px 14px 0", flexWrap: "wrap",
          }}>
            {["ALL", "REPEATED_ACTION", "DUPLICATE_PROMPT", "REPEAT_ERROR"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "3px 8px", borderRadius: 5, fontSize: 8,
                  fontWeight: 600, letterSpacing: 0.5, cursor: "pointer",
                  background: filter === f ? `${AM}33` : "transparent",
                  border: `1px solid ${filter === f ? AM : "#ffffff22"}`,
                  color: filter === f ? AM : "#8ea8b8",
                }}
              >
                {f.replace(/_/g, " ")}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: "6px 14px 0" }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search findings…"
              style={{
                width: "100%", padding: "5px 8px", fontSize: 10,
                background: "rgba(255,255,255,0.04)", border: "1px solid #ffffff18",
                borderRadius: 6, color: "#cdd6e0", outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* findings list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 14px" }}>
            {visible.length === 0 ? (
              <div style={{ color: DIM, fontSize: 10, textAlign: "center", paddingTop: 20 }}>
                {findings.length === 0
                  ? "No friction patterns detected in the last 24h — clean workflow."
                  : "No findings match the current filter."}
              </div>
            ) : (
              visible.map((item, i) => <FindingRow key={i} item={item} />)
            )}

            {/* action summary */}
            {Object.keys(summary).length > 0 && filter === "ALL" && !search && (
              <ActionSummary summary={summary} />
            )}
          </div>

          {/* assess footer */}
          <div style={{ padding: "8px 14px", borderTop: `1px solid #ffffff0d` }}>
            {brief && (
              <div style={{
                marginBottom: 6, padding: "6px 8px", fontSize: 10,
                background: `${AM}0d`, border: `1px solid ${AM}33`,
                borderRadius: 6, color: "#cdd6e0", lineHeight: 1.5,
              }}>
                {brief}
              </div>
            )}
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                width: "100%", padding: "6px", borderRadius: 6,
                background: assessing ? `${AM}22` : `${AM}33`,
                border: `1px solid ${AM}66`, color: AM,
                fontSize: 10, fontWeight: 700, cursor: assessing ? "default" : "pointer",
                letterSpacing: 0.5,
              }}
            >
              {assessing ? "ASSESSING…" : "▶ ASSESS FRICTION"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
