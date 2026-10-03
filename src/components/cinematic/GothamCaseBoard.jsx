/**
 * GothamCaseBoard — F244.
 *
 * Data source (real — backed by server/routes/gotham.py → SQLite gotham.db):
 *   GET /v1/gotham/cases?limit=50
 *       → {ok, items:[{case_id, title, status, priority, created_at}], count}
 *
 * Displays:
 *   - Stat tiles: total / open / closed / high-priority
 *   - ALL / OPEN / CLOSED filter tabs + title text search
 *   - Expand row → case_id chip, priority badge, status, age
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence case board brief + TTS
 *
 * Toggle: ◈ GCBD at left:142080, bottom:8, zIndex:124.
 * Badge: red = any open high-priority case; amber = total case count.
 * 90 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isGcbdQuery(q) / buildGcbdScript()
 *
 * Voice triggers: "gotham cases / case board / open cases / gotham board /
 *   gcbd / case management / case list / high priority cases /
 *   case tracker / gotham tracker / case engine"
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
const GOLD = "#FCD34D";

const BTN_LEFT   = 142080;
const REFRESH_MS = 90_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const GCBD_RE =
  /\b(gotham\s*(?:cases?|board|tracker)?|case\s*(?:board|list|management|tracker|engine)?|open\s*cases?|high[- ]priority\s*cases?|gcbd)\b/i;

export function isGcbdQuery(t) {
  return GCBD_RE.test(t || "");
}

export async function buildGcbdScript() {
  try {
    const r = await fetch(`${apiBase()}/v1/gotham/cases?limit=50`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    const d = await r.json();
    const items = d?.items || [];
    const total  = items.length;
    if (total === 0) {
      return "Gotham case board is empty — no cases logged yet. Use POST /v1/gotham/case to create a case.";
    }
    const open     = items.filter((c) => c.status === "open").length;
    const highPrio = items.filter(
      (c) => (c.priority === "high" || c.priority === "critical") && c.status === "open",
    ).length;
    const statuses = [...new Set(items.map((c) => c.status))].join(", ");
    return (
      `Gotham case board: ${total} total, ${open} open, ${highPrio} high-priority open. ` +
      `Statuses present: ${statuses}.` +
      (highPrio > 0 ? ` ${highPrio} case${highPrio !== 1 ? "s" : ""} require urgent attention.` : "")
    );
  } catch {
    return "Unable to retrieve Gotham case board data at this time, sir.";
  }
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchCases() {
  const r = await fetch(`${apiBase()}/v1/gotham/cases?limit=50`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function agentAssess(total, open, highPrio, topCases) {
  const sample = topCases
    .slice(0, 3)
    .map((c) => `"${c.title}" (${c.priority}, ${c.status})`)
    .join("; ");
  const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      message:
        `Assess this Gotham case board in 2 sentences: ${total} total cases, ${open} open, ` +
        `${highPrio} high-priority open. Sample cases: ${sample || "none"}.`,
    }),
  });
  const d = await r.json();
  return (d.answer || "").replace(/<<ACTION:[^>]*>>/g, "").trim() || "No assessment available.";
}

// ─── sub-components ───────────────────────────────────────────────────────────

function Tile({ label, value, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 80, background: `${color}0d`,
      border: `1px solid ${color}33`, borderRadius: 8,
      padding: "8px 10px", display: "flex", flexDirection: "column", gap: 3,
    }}>
      <span style={{ fontSize: 7, color: DIM, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 1 }}>{value}</span>
    </div>
  );
}

const PRIORITY_COLOR = {
  critical: RED,
  high:     ORNG,
  normal:   CY,
  low:      DIM,
};

const STATUS_COLOR = {
  open:   AM,
  closed: GN,
};

function priorityColor(p) {
  return PRIORITY_COLOR[p] || DIM;
}

function statusColor(s) {
  return STATUS_COLOR[s] || DIM;
}

function ageLabel(ts) {
  if (!ts) return "–";
  const diff = Date.now() / 1000 - ts;
  if (diff < 60)  return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function CaseRow({ c, expanded, onToggle }) {
  const pc = priorityColor(c.priority);
  const sc = statusColor(c.status);
  const isPulsing = (c.priority === "critical" || c.priority === "high") && c.status === "open";

  return (
    <div
      onClick={onToggle}
      style={{
        padding: "8px 12px", borderBottom: `1px solid ${CY}11`,
        cursor: "pointer", transition: "background 0.2s",
        background: expanded ? `${CY}06` : "transparent",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* priority dot */}
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: pc, flexShrink: 0,
          boxShadow: isPulsing ? `0 0 6px ${pc}` : "none",
        }} />
        {/* title */}
        <span style={{ flex: 1, fontSize: 10, color: "#C0D0DC", letterSpacing: 0.3 }}>
          {c.title}
        </span>
        {/* status */}
        <span style={{
          fontSize: 7, padding: "1px 5px", borderRadius: 3,
          border: `1px solid ${sc}55`, color: sc,
        }}>
          {(c.status || "?").toUpperCase()}
        </span>
        <span style={{ fontSize: 8, color: DIM }}>{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div style={{
          marginTop: 8, padding: "8px 10px",
          background: `${CY}05`, borderRadius: 6,
          border: `1px solid ${CY}15`,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 8, color: DIM }}>
              ID: <span style={{ color: CY, fontFamily: "monospace" }}>{c.case_id}</span>
            </span>
            <span style={{
              fontSize: 7, padding: "1px 5px", borderRadius: 3,
              border: `1px solid ${pc}55`, color: pc,
            }}>
              {(c.priority || "normal").toUpperCase()}
            </span>
            <span style={{ fontSize: 8, color: DIM }}>
              AGE: <span style={{ color: GOLD }}>{ageLabel(c.created_at)}</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ["ALL", "OPEN", "CLOSED"];

// ─── main component ───────────────────────────────────────────────────────────

export default function GothamCaseBoard() {
  const [open,       setOpen]       = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [dossier,    setDossier]    = useState(null);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);

  const intervalRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchCases();
      setData(d);
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
      if (GCBD_RE.test(q)) setOpen(true);
    };
    window.addEventListener("jarvis:gcbd-toggle", onToggle);
    window.addEventListener("jarvis:ask", onAsk);
    return () => {
      window.removeEventListener("jarvis:gcbd-toggle", onToggle);
      window.removeEventListener("jarvis:ask", onAsk);
    };
  }, []);

  async function handleAssess() {
    if (assessing || !data) return;
    const items    = data.items || [];
    const total    = items.length;
    const openCnt  = items.filter((c) => c.status === "open").length;
    const highPrio = items.filter(
      (c) => (c.priority === "high" || c.priority === "critical") && c.status === "open",
    ).length;
    setAssessing(true);
    setDossier(null);
    try {
      const text = await agentAssess(total, openCnt, highPrio, items);
      setDossier(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch (_) {
      setDossier("Assessment unavailable.");
    }
    setAssessing(false);
  }

  const items     = data?.items || [];
  const total     = items.length;
  const openCnt   = items.filter((c) => c.status === "open").length;
  const closedCnt = items.filter((c) => c.status === "closed").length;
  const highPrio  = items.filter(
    (c) => (c.priority === "high" || c.priority === "critical") && c.status === "open",
  ).length;

  const filtered = items.filter((c) => {
    if (tab === "OPEN"   && c.status !== "open")   return false;
    if (tab === "CLOSED" && c.status !== "closed") return false;
    if (search && !c.title?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const badgeColor = highPrio > 0 ? RED : total > 0 ? AM : DIM;
  const badgeLabel = highPrio > 0 ? `${highPrio}!` : String(total);

  return (
    <>
      {/* ── toggle button ──────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Gotham Case Board"
        style={{
          position: "fixed", bottom: 8, left: BTN_LEFT, zIndex: 124,
          background: "rgba(5,10,18,0.82)", border: `1px solid ${ORNG}55`,
          color: ORNG, fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, letterSpacing: 1, padding: "3px 8px",
          borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap",
        }}
      >
        ◈ GCBD
        <span style={{
          marginLeft: 5, background: badgeColor,
          color: "#000", borderRadius: 3, padding: "0 4px", fontSize: 8,
        }}>
          {badgeLabel}
        </span>
      </button>

      {/* ── panel ──────────────────────────────────────────────────────── */}
      {open && (
        <div style={{
          position: "fixed", top: 60, right: 18, zIndex: 125,
          width: "min(500px, 94vw)", maxHeight: "84vh",
          background: "rgba(5,10,18,0.96)",
          border: `1px solid ${ORNG}44`, borderRadius: 14,
          display: "flex", flexDirection: "column",
          boxShadow: `0 0 60px ${ORNG}14, 0 24px 48px rgba(0,0,0,0.8)`,
          fontFamily: "'JetBrains Mono',monospace",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px", borderBottom: `1px solid ${ORNG}22`,
            display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          }}>
            <span style={{ color: ORNG, fontSize: 13, fontWeight: 700, letterSpacing: 2 }}>
              ◈ GOTHAM CASE BOARD
            </span>
            {loading && (
              <span style={{ color: DIM, fontSize: 8, letterSpacing: 1 }}>POLLING…</span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: DIM, fontSize: 14, cursor: "pointer", lineHeight: 1 }}
            >×</button>
          </div>

          {/* Scrollable body */}
          <div style={{ overflowY: "auto", flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

            {/* Stat tiles */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Tile label="TOTAL"         value={total}    color={CY}   />
              <Tile label="OPEN"          value={openCnt}  color={AM}   />
              <Tile label="CLOSED"        value={closedCnt} color={GN}  />
              <Tile label="HIGH PRIORITY" value={highPrio} color={highPrio > 0 ? RED : DIM} />
            </div>

            {/* Filter tabs + search */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: tab === t ? `${ORNG}22` : "transparent",
                    border: `1px solid ${tab === t ? ORNG : DIM}55`,
                    color: tab === t ? ORNG : DIM,
                    fontSize: 8, letterSpacing: 1, padding: "3px 10px",
                    borderRadius: 4, cursor: "pointer",
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {t}
                </button>
              ))}
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search titles…"
                style={{
                  flex: 1, minWidth: 120,
                  background: `${CY}08`, border: `1px solid ${CY}22`,
                  color: "#C0D0DC", fontSize: 9, padding: "3px 8px",
                  borderRadius: 4, outline: "none",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              />
            </div>

            {/* Case list */}
            <div style={{
              border: `1px solid ${CY}22`, borderRadius: 8, overflow: "hidden",
              minHeight: 40,
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 16, fontSize: 9, color: DIM, textAlign: "center" }}>
                  {items.length === 0 ? "No cases logged yet." : "No cases match filter."}
                </div>
              ) : (
                filtered.map((c) => (
                  <CaseRow
                    key={c.case_id}
                    c={c}
                    expanded={expanded === c.case_id}
                    onToggle={() => setExpanded((v) => v === c.case_id ? null : c.case_id)}
                  />
                ))
              )}
            </div>

            {/* Showing count */}
            <div style={{ fontSize: 7, color: DIM, textAlign: "right" }}>
              {filtered.length} / {total} cases
            </div>

            {/* ASSESS */}
            <div>
              <button
                onClick={handleAssess}
                disabled={assessing}
                style={{
                  background: assessing ? `${ORNG}22` : `${ORNG}11`,
                  border: `1px solid ${ORNG}55`, color: ORNG,
                  fontSize: 9, letterSpacing: 1, padding: "5px 14px",
                  borderRadius: 6, cursor: assessing ? "not-allowed" : "pointer",
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {assessing ? "▸ ASSESSING…" : "▶ ASSESS"}
              </button>
              {dossier && (
                <div style={{
                  marginTop: 8, padding: 10,
                  background: `${ORNG}08`, border: `1px solid ${ORNG}22`,
                  borderRadius: 6, fontSize: 10, color: "#C0D0DC", lineHeight: 1.6,
                }}>
                  {dossier}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
