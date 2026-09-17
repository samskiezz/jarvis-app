/**
 * PendingActionsBoard — F277.
 *
 * Unified "what needs my attention" view across four systems.
 * Data sources (all real — endpoints listed in JARVIS_FEATURE_BACKLOG.md):
 *   GET  /v1/spec/list             (poll 90 s) → {items:[{id,title,status,frontmatter}]}
 *   GET  /v1/intent/list?limit=50  (poll 60 s) → {items:[{id,text,kind,state,source}], total}
 *   GET  /v1/decision/list?limit=50 (poll 90 s) → {items:[{id,title,status,body_md,quality_score}]}
 *   GET  /v1/proofpack/list?limit=50 (poll 90 s) → {items:[{id,title,commit,created_at}]}
 *   POST /v1/spec/{id}/approve     → approve a draft spec (from F250)
 *   POST /v1/intent/{id}/state     → mark intent ready {state:"ready"} (from F247)
 *   POST /v1/proofpack/{id}/export → export proof pack, returns markdown (from F255)
 *
 * Displays:
 *   - Stat tiles: draft specs / raw intents / draft decisions / proof packs
 *   - ALL | SPECS | INTENTS | DECISIONS | PACKS tab switcher + text search
 *   - SPECS: draft specs with ✓ APPROVE per row
 *   - INTENTS: raw intents with ✓ READY per row
 *   - DECISIONS: draft decisions with expand → body_md excerpt + quality score
 *   - PACKS: recent proof packs with ▶ EXPORT per row (inline markdown preview)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence action brief + TTS
 *
 * Toggle: ◈ PACT at left:283440, bottom:8, zIndex:155.
 * Badge: amber = draft specs or raw intents pending action, green = all clear.
 * 90 s auto-refresh on all four endpoints.
 *
 * Exported helpers for JarvisBrain:
 *   isPactQuery(q) / buildPactScript()
 *
 * Voice triggers: "pending actions / pact / action board / what needs approval /
 *   draft specs / raw intents / pending items / approval queue / pending decisions /
 *   action digest / what needs attention"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY   = "#29E7FF";
const AM   = "#F5A623";
const GN   = "#4ADE80";
const PU   = "#A78BFA";
const RD   = "#F87171";
const DIM  = "#3A4A55";
const GRAY = "#4E6070";

const BTN_LEFT    = 283440;
const POLL_SLOW   = 90_000;
const POLL_FAST   = 60_000;
const API_KEY     =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const PACT_RE =
  /\b(pending\s+actions?|pact\b|action\s+board|what\s+needs\s+approval|draft\s+specs?|raw\s+intents?|pending\s+items?|approval\s+queue|pending\s+decisions?|action\s+digest|what\s+needs\s+attention)\b/i;

export function isPactQuery(q) {
  return PACT_RE.test(q || "");
}

export async function buildPactScript() {
  try {
    const [specsR, intentsR, decisionsR] = await Promise.all([
      fetch(`${apiBase()}/v1/spec/list`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/intent/list?limit=50`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
      fetch(`${apiBase()}/v1/decision/list?limit=50`, { headers: { Authorization: `Bearer ${API_KEY}` } }),
    ]);
    const specs     = await specsR.json();
    const intents   = await intentsR.json();
    const decisions = await decisionsR.json();
    window.dispatchEvent(new CustomEvent("jarvis:pact-toggle"));
    const draftSpecs = (specs?.items ?? []).filter((s) => s.status === "draft").length;
    const rawIntents = (intents?.items ?? []).filter((i) => i.state === "raw").length;
    const draftDecisions = (decisions?.items ?? []).filter((d) => d.status === "draft").length;
    return (
      `Pending actions: ${draftSpecs} draft spec${draftSpecs !== 1 ? "s" : ""} need approval, ` +
      `${rawIntents} raw intent${rawIntents !== 1 ? "s" : ""} need triage, ` +
      `${draftDecisions} decision${draftDecisions !== 1 ? "s" : ""} in draft. ` +
      "Open the board to approve, triage, or export pending items."
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:pact-toggle"));
    return "Pending Actions Board open, sir.";
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function age(ts) {
  if (!ts) return "—";
  const raw = typeof ts === "number" ? ts : new Date(ts).getTime() / 1000;
  if (isNaN(raw)) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000 - raw));
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function truncate(str, len = 120) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

function hdr() {
  return { Authorization: `Bearer ${API_KEY}` };
}

async function fetchSpecs() {
  const r = await fetch(`${apiBase()}/v1/spec/list`, { headers: hdr() });
  if (!r.ok) throw new Error(`spec/list ${r.status}`);
  return r.json();
}

async function fetchIntents() {
  const r = await fetch(`${apiBase()}/v1/intent/list?limit=50`, { headers: hdr() });
  if (!r.ok) throw new Error(`intent/list ${r.status}`);
  return r.json();
}

async function fetchDecisions() {
  const r = await fetch(`${apiBase()}/v1/decision/list?limit=50`, { headers: hdr() });
  if (!r.ok) throw new Error(`decision/list ${r.status}`);
  return r.json();
}

async function fetchPacks() {
  const r = await fetch(`${apiBase()}/v1/proofpack/list?limit=50`, { headers: hdr() });
  if (!r.ok) throw new Error(`proofpack/list ${r.status}`);
  return r.json();
}

async function approveSpec(id) {
  const r = await fetch(`${apiBase()}/v1/spec/${id}/approve`, {
    method: "POST",
    headers: { ...hdr(), "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`spec/approve ${r.status}`);
  return r.json();
}

async function markIntentReady(id) {
  const r = await fetch(`${apiBase()}/v1/intent/${id}/state`, {
    method: "POST",
    headers: { ...hdr(), "Content-Type": "application/json" },
    body: JSON.stringify({ state: "ready" }),
  });
  if (!r.ok) throw new Error(`intent/state ${r.status}`);
  return r.json();
}

async function exportPack(id) {
  const r = await fetch(`${apiBase()}/v1/proofpack/${id}/export`, {
    method: "POST",
    headers: { ...hdr(), "Content-Type": "application/json" },
  });
  if (!r.ok) throw new Error(`proofpack/export ${r.status}`);
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

function ActionBtn({ label, onClick, disabled, color = CY }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: `${color}11`,
        border: `1px solid ${color}44`,
        borderRadius: 3,
        color: disabled ? GRAY : color,
        cursor: disabled ? "wait" : "pointer",
        flexShrink: 0,
        fontFamily: "monospace",
        fontSize: 9,
        padding: "2px 7px",
      }}
    >
      {label}
    </button>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function PendingActionsBoard() {
  const [open, setOpen]           = useState(false);
  const [specs, setSpecs]         = useState(null);
  const [intents, setIntents]     = useState(null);
  const [decisions, setDecisions] = useState(null);
  const [packs, setPacks]         = useState(null);
  const [tab, setTab]             = useState("ALL");
  const [search, setSearch]       = useState("");
  const [expanded, setExpanded]   = useState({});
  const [busy, setBusy]           = useState({});
  const [exports, setExports]     = useState({});
  const [assessing, setAssessing] = useState(false);
  const [assessText, setAssessText] = useState("");
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [sp, in_, dc, pk] = await Promise.all([
        fetchSpecs(),
        fetchIntents(),
        fetchDecisions(),
        fetchPacks(),
      ]);
      setSpecs(sp);
      setIntents(in_);
      setDecisions(dc);
      setPacks(pk);
    } catch {
      // leave previous data intact
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, Math.min(POLL_FAST, POLL_SLOW));
    return () => clearInterval(timerRef.current);
  }, [load]);

  useEffect(() => {
    const onToggle = () => setOpen((o) => !o);
    window.addEventListener("jarvis:pact-toggle", onToggle);
    return () => window.removeEventListener("jarvis:pact-toggle", onToggle);
  }, []);

  // derived counts
  const draftSpecs    = (specs?.items ?? []).filter((s) => s.status === "draft");
  const rawIntents    = (intents?.items ?? []).filter((i) => i.state === "raw");
  const draftDecs     = (decisions?.items ?? []).filter((d) => d.status === "draft");
  const allPacks      = packs?.items ?? [];
  const totalPending  = draftSpecs.length + rawIntents.length + draftDecs.length;

  const badgeColor = totalPending > 0 ? AM : GN;
  const badgeVal   = totalPending > 0 ? totalPending : "OK";

  const lc = search.toLowerCase();

  function matches(str) {
    return !lc || (str || "").toLowerCase().includes(lc);
  }

  const filteredSpecs = draftSpecs.filter((s) => matches(s.title) || matches(s.status));
  const filteredIntents = rawIntents.filter((i) => matches(i.text) || matches(i.kind) || matches(i.source));
  const filteredDecs = draftDecs.filter((d) => matches(d.title) || matches(d.body_md));
  const filteredPacks = allPacks.filter((p) => matches(p.title) || matches(p.commit));

  // ALL tab merges everything with a type tag
  const allItems = [
    ...filteredSpecs.map((s) => ({ type: "SPEC", ...s })),
    ...filteredIntents.map((i) => ({ type: "INTENT", ...i })),
    ...filteredDecs.map((d) => ({ type: "DECISION", ...d })),
    ...filteredPacks.map((p) => ({ type: "PACK", ...p })),
  ];

  function toggleExpand(key) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function markBusy(id, val) {
    setBusy((prev) => ({ ...prev, [id]: val }));
  }

  async function handleApproveSpec(id) {
    if (busy[id]) return;
    markBusy(id, true);
    try {
      await approveSpec(id);
      await load();
    } catch {
      // silently ignore
    } finally {
      markBusy(id, false);
    }
  }

  async function handleMarkReady(id) {
    if (busy[id]) return;
    markBusy(id, true);
    try {
      await markIntentReady(id);
      await load();
    } catch {
      // silently ignore
    } finally {
      markBusy(id, false);
    }
  }

  async function handleExport(id) {
    if (busy[id]) return;
    markBusy(id, true);
    try {
      const res = await exportPack(id);
      const md = res?.markdown || res?.content || JSON.stringify(res);
      setExports((prev) => ({ ...prev, [id]: md }));
    } catch {
      setExports((prev) => ({ ...prev, [id]: "Export failed." }));
    } finally {
      markBusy(id, false);
    }
  }

  async function assess() {
    setAssessing(true); setAssessText("");
    try {
      const brief = await buildPactScript();
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { ...hdr(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `Pending actions board: ${draftSpecs.length} draft spec(s) need approval, ` +
            `${rawIntents.length} raw intent(s) need triage, ` +
            `${draftDecs.length} draft decision(s) pending, ` +
            `${allPacks.length} proof pack(s) in library. ` +
            "Give a 2-sentence brief on what should be prioritized next.",
        }),
      });
      const d = await r.json();
      const text = d?.response || d?.message || brief;
      setAssessText(text);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text } }));
    } catch {
      setAssessText("Action assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  // ── row renderers ─────────────────────────────────────────────────────────

  function renderSpecRow(item) {
    const k = `spec-${item.id}`;
    return (
      <div
        key={k}
        style={{
          borderBottom: "1px solid rgba(41,231,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 0",
        }}
      >
        <span
          style={{
            background: `${AM}22`,
            border: `1px solid ${AM}44`,
            borderRadius: 3,
            color: AM,
            flexShrink: 0,
            fontSize: 9,
            padding: "1px 5px",
          }}
        >
          DRAFT
        </span>
        <span style={{ color: "#8BAFC4", flex: 1, fontSize: 11 }}>
          {truncate(item.title || item.id, 100)}
        </span>
        <ActionBtn
          label={busy[item.id] ? "…" : "✓ APPROVE"}
          onClick={() => handleApproveSpec(item.id)}
          disabled={busy[item.id]}
          color={GN}
        />
      </div>
    );
  }

  function renderIntentRow(item) {
    const k = `intent-${item.id}`;
    return (
      <div
        key={k}
        style={{
          borderBottom: "1px solid rgba(41,231,255,0.06)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 0",
        }}
      >
        <span
          style={{
            background: `${PU}22`,
            border: `1px solid ${PU}44`,
            borderRadius: 3,
            color: PU,
            flexShrink: 0,
            fontSize: 9,
            padding: "1px 5px",
          }}
        >
          {item.kind || "raw"}
        </span>
        <span style={{ color: "#8BAFC4", flex: 1, fontSize: 11 }}>
          {truncate(item.text, 100)}
        </span>
        <ActionBtn
          label={busy[item.id] ? "…" : "✓ READY"}
          onClick={() => handleMarkReady(item.id)}
          disabled={busy[item.id]}
          color={CY}
        />
      </div>
    );
  }

  function renderDecisionRow(item) {
    const k = `dec-${item.id}`;
    const isExp = expanded[k];
    const score = item.quality_score != null ? Math.round(item.quality_score * 100) : null;
    return (
      <div key={k} style={{ borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
        <div
          onClick={() => toggleExpand(k)}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
          }}
        >
          <span
            style={{
              background: `${AM}22`,
              border: `1px solid ${AM}44`,
              borderRadius: 3,
              color: AM,
              flexShrink: 0,
              fontSize: 9,
              padding: "1px 5px",
            }}
          >
            DRAFT
          </span>
          <span style={{ color: "#8BAFC4", flex: 1, fontSize: 11 }}>
            {truncate(item.title || item.id, 90)}
          </span>
          {score != null && (
            <span style={{ color: GRAY, fontSize: 9 }}>{score}%</span>
          )}
          <span style={{ color: GRAY, fontSize: 10 }}>{isExp ? "▲" : "▼"}</span>
        </div>
        {isExp && item.body_md && (
          <div
            style={{
              background: "rgba(41,231,255,0.03)",
              border: "1px solid rgba(41,231,255,0.08)",
              borderRadius: 4,
              color: GRAY,
              fontSize: 10,
              lineHeight: 1.5,
              margin: "0 0 6px 12px",
              padding: "6px 8px",
            }}
          >
            {truncate(item.body_md, 300)}
          </div>
        )}
      </div>
    );
  }

  function renderPackRow(item) {
    const k = `pack-${item.id}`;
    const md = exports[item.id];
    return (
      <div key={k} style={{ borderBottom: "1px solid rgba(41,231,255,0.06)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 0",
          }}
        >
          <span
            style={{
              background: "rgba(41,231,255,0.06)",
              border: "1px solid rgba(41,231,255,0.15)",
              borderRadius: 3,
              color: CY,
              flexShrink: 0,
              fontSize: 9,
              padding: "1px 5px",
            }}
          >
            {item.commit ? item.commit.slice(0, 7) : "PACK"}
          </span>
          <span style={{ color: "#8BAFC4", flex: 1, fontSize: 11 }}>
            {truncate(item.title || item.id, 90)}
          </span>
          <span style={{ color: GRAY, flexShrink: 0, fontSize: 9 }}>
            {age(item.created_at)}
          </span>
          <ActionBtn
            label={busy[item.id] ? "…" : "▶ EXPORT"}
            onClick={() => handleExport(item.id)}
            disabled={busy[item.id]}
            color={PU}
          />
        </div>
        {md && (
          <div
            style={{
              background: "rgba(167,139,250,0.04)",
              border: "1px solid rgba(167,139,250,0.15)",
              borderRadius: 4,
              color: GRAY,
              fontFamily: "monospace",
              fontSize: 10,
              lineHeight: 1.5,
              margin: "0 0 6px 12px",
              maxHeight: 100,
              overflow: "auto",
              padding: "6px 8px",
              whiteSpace: "pre-wrap",
            }}
          >
            {truncate(md, 400)}
          </div>
        )}
      </div>
    );
  }

  // ── ALL tab row ───────────────────────────────────────────────────────────

  function renderAllRow(item) {
    if (item.type === "SPEC")     return renderSpecRow(item);
    if (item.type === "INTENT")   return renderIntentRow(item);
    if (item.type === "DECISION") return renderDecisionRow(item);
    if (item.type === "PACK")     return renderPackRow(item);
    return null;
  }

  const isEmpty = {
    ALL:      allItems.length === 0,
    SPECS:    filteredSpecs.length === 0,
    INTENTS:  filteredIntents.length === 0,
    DECISIONS: filteredDecs.length === 0,
    PACKS:    filteredPacks.length === 0,
  };

  const tabItems = {
    ALL:      allItems,
    SPECS:    filteredSpecs,
    INTENTS:  filteredIntents,
    DECISIONS: filteredDecs,
    PACKS:    filteredPacks,
  };

  return (
    <>
      {/* ── dock button ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Pending Actions Board"
        style={{
          position: "fixed",
          left: BTN_LEFT,
          bottom: 8,
          zIndex: 155,
          background: open ? "rgba(41,231,255,0.15)" : "rgba(10,18,26,0.85)",
          border: `1px solid ${open ? CY : "rgba(41,231,255,0.25)"}`,
          borderRadius: 5,
          color: open ? CY : "#8BAFC4",
          cursor: "pointer",
          fontFamily: "monospace",
          fontSize: 10,
          letterSpacing: "0.06em",
          padding: "4px 8px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span>◈</span>
        <span>PACT</span>
        <span
          style={{
            background: badgeColor,
            borderRadius: 3,
            color: "#0A121A",
            fontSize: 9,
            fontWeight: 700,
            minWidth: 24,
            padding: "0 3px",
            textAlign: "center",
          }}
        >
          {badgeVal}
        </span>
      </button>

      {/* ── panel ───────────────────────────────────────────────────────────── */}
      {open && (
        <div
          style={{
            position: "fixed",
            left: BTN_LEFT - 400,
            bottom: 44,
            zIndex: 155,
            width: 460,
            maxHeight: 600,
            background: "rgba(8,16,24,0.97)",
            border: "1px solid rgba(41,231,255,0.22)",
            borderRadius: 8,
            boxShadow: "0 8px 40px rgba(0,0,0,0.7)",
            display: "flex",
            flexDirection: "column",
            fontFamily: "monospace",
            overflow: "hidden",
          }}
        >
          {/* header */}
          <div
            style={{
              borderBottom: "1px solid rgba(41,231,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
            }}
          >
            <span style={{ color: CY, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", flex: 1 }}>
              ◈ PENDING ACTIONS BOARD
            </span>
            {totalPending > 0 && (
              <span
                style={{
                  background: `${AM}22`,
                  border: `1px solid ${AM}55`,
                  borderRadius: 3,
                  color: AM,
                  fontSize: 9,
                  padding: "1px 5px",
                }}
              >
                {totalPending} pending
              </span>
            )}
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", color: GRAY, cursor: "pointer", fontSize: 13 }}
            >
              ✕
            </button>
          </div>

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px 4px" }}>
            <StatTile
              label="Draft Specs"
              value={draftSpecs.length}
              color={draftSpecs.length > 0 ? AM : GN}
            />
            <StatTile
              label="Raw Intents"
              value={rawIntents.length}
              color={rawIntents.length > 0 ? AM : GN}
            />
            <StatTile
              label="Draft Decisions"
              value={draftDecs.length}
              color={draftDecs.length > 0 ? AM : GRAY}
            />
            <StatTile
              label="Proof Packs"
              value={allPacks.length}
              color={PU}
            />
          </div>

          {/* tab bar + search */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 12px", flexWrap: "wrap" }}>
            <TabBtn
              label="ALL"
              active={tab === "ALL"}
              count={allItems.length || null}
              onClick={() => { setTab("ALL"); setSearch(""); }}
            />
            <TabBtn
              label="SPECS"
              active={tab === "SPECS"}
              count={draftSpecs.length || null}
              onClick={() => { setTab("SPECS"); setSearch(""); }}
            />
            <TabBtn
              label="INTENTS"
              active={tab === "INTENTS"}
              count={rawIntents.length || null}
              onClick={() => { setTab("INTENTS"); setSearch(""); }}
            />
            <TabBtn
              label="DECISIONS"
              active={tab === "DECISIONS"}
              count={draftDecs.length || null}
              onClick={() => { setTab("DECISIONS"); setSearch(""); }}
            />
            <TabBtn
              label="PACKS"
              active={tab === "PACKS"}
              count={allPacks.length || null}
              onClick={() => { setTab("PACKS"); setSearch(""); }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search…"
              style={{
                background: "rgba(41,231,255,0.05)",
                border: "1px solid rgba(41,231,255,0.12)",
                borderRadius: 4,
                color: CY,
                flex: 1,
                fontFamily: "monospace",
                fontSize: 10,
                marginLeft: 4,
                minWidth: 70,
                outline: "none",
                padding: "3px 6px",
              }}
            />
          </div>

          {/* body */}
          <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 8px" }}>
            {specs === null && (
              <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                Loading…
              </div>
            )}

            {specs !== null && isEmpty[tab] && (
              <div style={{ color: GRAY, fontSize: 11, padding: "12px 0", textAlign: "center" }}>
                {lc ? "No matches." : "No pending items in this category."}
              </div>
            )}

            {tab === "ALL" && tabItems.ALL.map((item) => renderAllRow(item))}

            {tab === "SPECS" && filteredSpecs.map((item) => renderSpecRow(item))}

            {tab === "INTENTS" && filteredIntents.map((item) => renderIntentRow(item))}

            {tab === "DECISIONS" && filteredDecs.map((item) => renderDecisionRow(item))}

            {tab === "PACKS" && filteredPacks.map((item) => renderPackRow(item))}
          </div>

          {/* assess footer */}
          <div
            style={{
              borderTop: "1px solid rgba(41,231,255,0.10)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              padding: "6px 12px 8px",
            }}
          >
            <button
              onClick={assess}
              disabled={assessing}
              style={{
                alignSelf: "flex-start",
                background: "rgba(41,231,255,0.08)",
                border: `1px solid ${CY}44`,
                borderRadius: 4,
                color: CY,
                cursor: assessing ? "wait" : "pointer",
                fontFamily: "monospace",
                fontSize: 10,
                padding: "3px 10px",
              }}
            >
              {assessing ? "Assessing…" : "▶ ASSESS"}
            </button>
            {assessText && (
              <div
                style={{
                  background: "rgba(41,231,255,0.04)",
                  border: "1px solid rgba(41,231,255,0.10)",
                  borderRadius: 4,
                  color: "#8BAFC4",
                  fontSize: 10,
                  lineHeight: 1.5,
                  padding: "5px 8px",
                }}
              >
                {assessText}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
