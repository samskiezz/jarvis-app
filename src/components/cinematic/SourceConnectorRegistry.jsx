/**
 * SourceConnectorRegistry — F268.
 *
 * Data sources:
 *   GET /v1/sources          (poll 60 s) → {items:[{id,name,kind,config,...}], count, kinds:[...]}
 *   GET /v1/sources/{id}/runs             → {connector_id, runs:[{id,status,rows,...}], count}
 *   POST /v1/sources/{id}/run             → trigger a connector run
 *
 * Displays:
 *   - Stat tiles: total / kinds / last-run-ok / last-run-fail
 *   - ALL + kind filter tabs (rest_json/csv_url/rss/inline/...) + text search
 *   - Per-connector: name + kind chip + created age + last-run status
 *   - Expand row → lazy GET /v1/sources/{id}/runs for run history table
 *   - ▶ RUN per connector → POST /v1/sources/{id}/run → inline result
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence brief + TTS
 *
 * Toggle: ◈ SREG at left:242400, bottom:8, zIndex:146.
 * Green badge = connector count; amber badge when any connector has a failed run.
 * 60 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isSregQuery(q) / buildSregScript()
 *
 * Voice triggers: "source connector / connector registry / data sources / sreg /
 *   data connectors / registered connectors / connector runs / data feeds /
 *   connector health / which connectors / source registry / ingest connector"
 *
 * Mounted in src/App.jsx.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY    = "#29E7FF";
const AMBER = "#F5A623";
const GREEN = "#4ADE80";
const RED   = "#F87171";
const GRAY  = "#4E6070";
const PURP  = "#B06EFF";

const BTN_LEFT   = 242400;
const REFRESH_MS = 60_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchConnectors() {
  const r = await fetch(`${apiBase()}/v1/sources`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`sources ${r.status}`);
  return r.json();
}

async function fetchRuns(connectorId) {
  const r = await fetch(`${apiBase()}/v1/sources/${encodeURIComponent(connectorId)}/runs?limit=20`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!r.ok) throw new Error(`runs ${r.status}`);
  return r.json();
}

async function triggerRun(connectorId) {
  const r = await fetch(`${apiBase()}/v1/sources/${encodeURIComponent(connectorId)}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!r.ok) throw new Error(`run ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const SREG_RE =
  /\b(source.?connector|connector.?registry|data.?source|sreg|data.?connector|registered.?connector|connector.?run|data.?feed|connector.?health|which.?connector|source.?registry|ingest.?connector|connector.?status)\b/i;

export function isSregQuery(q) {
  return SREG_RE.test(q || "");
}

export async function buildSregScript() {
  try {
    const data = await fetchConnectors();
    window.dispatchEvent(new CustomEvent("jarvis:sreg-toggle"));
    const total = data?.count ?? (data?.items ?? []).length;
    const kinds = data?.kinds ?? [];
    const items = data?.items ?? [];
    const failedAny = items.some((c) => c.last_run?.status === "error" || c.last_run?.status === "failed");
    return (
      `Source Connector Registry shows ${total} registered connector${total !== 1 ? "s" : ""} across ${kinds.length || "multiple"} kind${kinds.length !== 1 ? "s" : ""}, sir. ` +
      (failedAny
        ? "One or more connectors recorded a failed run — recommend reviewing the run history."
        : "All connectors report clean run status — no failures detected.")
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:sreg-toggle"));
    return "Source Connector Registry open, sir.";
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
      <div style={{ fontSize: 15, fontWeight: 700, color: color || CY }}>{value ?? "—"}</div>
      <div style={{ fontSize: 7, color: GRAY, marginTop: 2, letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

function KindChip({ kind }) {
  const colors = {
    rest_json: CY,
    csv_url:   GREEN,
    rss:       AMBER,
    inline:    PURP,
  };
  const col = colors[kind] || GRAY;
  return (
    <span
      style={{
        background: `${col}18`,
        border: `1px solid ${col}44`,
        borderRadius: 4,
        padding: "1px 5px",
        color: col,
        fontSize: 8,
        letterSpacing: 1,
        whiteSpace: "nowrap",
      }}
    >
      {(kind || "").toUpperCase()}
    </span>
  );
}

function RunRow({ run }) {
  const statusColors = { ok: GREEN, success: GREEN, error: RED, failed: RED, running: AMBER };
  const col = statusColors[run.status] || GRAY;
  const ts = run.ts || run.created_at || run.started_at;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "3px 8px",
        borderBottom: `1px solid ${CY}11`,
        fontSize: 8,
      }}
    >
      <span style={{ color: col, minWidth: 44 }}>{(run.status || "?").toUpperCase()}</span>
      <span style={{ color: GREEN, minWidth: 36 }}>{run.rows ?? run.row_count ?? "—"} rows</span>
      {run.dataset_name && (
        <span style={{ color: PURP, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          → {run.dataset_name}
        </span>
      )}
      {ts && (
        <span style={{ color: GRAY, whiteSpace: "nowrap" }}>
          {relAge(ts)}
        </span>
      )}
    </div>
  );
}

function relAge(ts) {
  if (!ts) return "—";
  const secs = Math.floor((Date.now() / 1000) - (typeof ts === "number" ? ts : new Date(ts).getTime() / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function ConnectorRow({ connector }) {
  const [expanded,  setExpanded]  = useState(false);
  const [runs,      setRuns]      = useState(null);
  const [runsLoad,  setRunsLoad]  = useState(false);
  const [running,   setRunning]   = useState(false);
  const [runResult, setRunResult] = useState(null);

  async function loadRuns() {
    if (runs !== null) return;
    setRunsLoad(true);
    try {
      const d = await fetchRuns(connector.id || connector.name);
      setRuns(d);
    } catch {
      setRuns({ runs: [], count: 0 });
    } finally {
      setRunsLoad(false);
    }
  }

  function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next) loadRuns();
  }

  async function handleRun() {
    setRunning(true);
    setRunResult(null);
    try {
      const d = await triggerRun(connector.id || connector.name);
      setRunResult({ ok: true, rows: d?.rows ?? d?.row_count ?? "?" });
      setRuns(null); // force reload on next expand
    } catch (e) {
      setRunResult({ ok: false, msg: e.message });
    } finally {
      setRunning(false);
    }
  }

  const lastRun = connector.last_run;
  const lastRunCol = lastRun?.status === "ok" || lastRun?.status === "success"
    ? GREEN
    : lastRun?.status === "error" || lastRun?.status === "failed"
    ? RED
    : GRAY;

  return (
    <div style={{ borderBottom: `1px solid ${CY}18` }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          cursor: "pointer",
        }}
        onClick={handleExpand}
      >
        <span style={{ color: CY, flex: 1, fontSize: 9, fontWeight: 600 }}>
          {connector.name || connector.id}
        </span>
        <KindChip kind={connector.kind} />
        {lastRun && (
          <span style={{ color: lastRunCol, fontSize: 8 }}>
            {(lastRun.status || "").toUpperCase()}
          </span>
        )}
        {connector.created_at && (
          <span style={{ color: GRAY, fontSize: 8 }}>{relAge(connector.created_at)}</span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleRun(); }}
          disabled={running}
          style={{
            background: running ? `${GRAY}18` : `${GREEN}18`,
            border: `1px solid ${running ? GRAY : GREEN}55`,
            borderRadius: 4,
            padding: "1px 6px",
            color: running ? GRAY : GREEN,
            fontSize: 8,
            cursor: running ? "default" : "pointer",
            fontFamily: "inherit",
            letterSpacing: 1,
          }}
        >
          {running ? "…" : "▶ RUN"}
        </button>
        <span style={{ color: GRAY, fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {runResult && (
        <div
          style={{
            padding: "3px 14px",
            fontSize: 8,
            color: runResult.ok ? GREEN : RED,
          }}
        >
          {runResult.ok ? `✓ Run complete — ${runResult.rows} rows ingested` : `✕ Run failed: ${runResult.msg}`}
        </div>
      )}

      {expanded && (
        <div style={{ background: "rgba(0,0,0,0.25)", paddingBottom: 4 }}>
          {runsLoad && (
            <div style={{ padding: "6px 14px", fontSize: 8, color: GRAY }}>Loading runs…</div>
          )}
          {!runsLoad && runs && (runs.runs || []).length === 0 && (
            <div style={{ padding: "6px 14px", fontSize: 8, color: GRAY }}>No run history.</div>
          )}
          {!runsLoad && runs && (runs.runs || []).map((r, i) => (
            <RunRow key={r.id || i} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function SourceConnectorRegistry() {
  const [visible,    setVisible]    = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:sreg-toggle", onToggle);
    return () => window.removeEventListener("jarvis:sreg-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchConnectors();
      setData(d);
    } catch {
      // retain stale
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [visible, load]);

  const items    = data?.items ?? [];
  const kinds    = data?.kinds ?? [...new Set(items.map((c) => c.kind).filter(Boolean))];
  const total    = data?.count ?? items.length;

  const lastRunOk   = items.filter((c) => c.last_run?.status === "ok" || c.last_run?.status === "success").length;
  const lastRunFail = items.filter((c) => c.last_run?.status === "error" || c.last_run?.status === "failed").length;

  const kindsDisplay = kinds.length > 0 ? kinds.length : "—";
  const badgeColor   = lastRunFail > 0 ? AMBER : GREEN;
  const badgeVal     = total > 0 ? total : null;

  const TABS = ["ALL", ...kinds.map((k) => k.toUpperCase())];

  const filtered = items.filter((c) => {
    const kindMatch = tab === "ALL" || c.kind?.toUpperCase() === tab;
    const q = search.toLowerCase();
    const textMatch = !q || (c.name || "").toLowerCase().includes(q) || (c.kind || "").toLowerCase().includes(q);
    return kindMatch && textMatch;
  });

  async function handleAssess() {
    setAssessing(true);
    try {
      const ctx = `connectors=${total}, kinds=${kinds.join(",")}, failed_runs=${lastRunFail}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `In 2 sentences, assess the source connector registry health. Context: ${ctx}`,
        }),
      });
      const d = await r.json();
      const brief = (d.answer || "Source connector assessment unavailable.").replace(/<<ACTION:[^>]*>>/g, "").trim();
      setAssessment(brief);
      window.dispatchEvent(new CustomEvent("jarvis:speak-dossier", { detail: { text: brief } }));
    } catch {
      setAssessment("Assessment unavailable.");
    } finally {
      setAssessing(false);
    }
  }

  const panelW = 480;
  const panelL = Math.min(BTN_LEFT, window.innerWidth - panelW - 10);

  return (
    <>
      {/* ── trigger button ── */}
      <div
        style={{
          position: "fixed",
          left:     `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          bottom:   8,
          zIndex:   146,
          display:  "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap: 2,
        }}
      >
        {badgeVal && (
          <div
            style={{
              background: badgeColor,
              color:  "#000",
              borderRadius: 8,
              fontSize: 7,
              padding:  "1px 5px",
              fontWeight: 700,
              letterSpacing: 1,
            }}
          >
            {badgeVal}
          </div>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("jarvis:sreg-toggle"))}
          style={{
            background:   "rgba(41,231,255,0.08)",
            border:       `1px solid ${CY}55`,
            borderRadius: 6,
            padding:      "3px 8px",
            color:        CY,
            fontSize:     8,
            letterSpacing: 1,
            cursor:       "pointer",
            fontFamily:   "inherit",
            whiteSpace:   "nowrap",
          }}
        >
          ◈ SREG
        </button>
      </div>

      {/* ── panel ── */}
      {visible && (
        <div
          style={{
            position:     "fixed",
            left:         `min(${panelL}px, calc(100vw - ${panelW + 10}px))`,
            bottom:       40,
            zIndex:       146,
            width:        panelW,
            maxHeight:    "72vh",
            background:   "rgba(4,14,22,0.97)",
            border:       `1px solid ${CY}44`,
            borderRadius: 10,
            display:      "flex",
            flexDirection: "column",
            overflow:     "hidden",
            fontFamily:   "monospace",
            boxShadow:    `0 0 28px ${CY}22`,
          }}
        >
          {/* header */}
          <div
            style={{
              padding:        "8px 12px 6px",
              borderBottom:   `1px solid ${CY}22`,
              display:        "flex",
              alignItems:     "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <span style={{ color: CY, fontWeight: 700, fontSize: 10, letterSpacing: 2 }}>
              ◈ SOURCE CONNECTOR REGISTRY
            </span>
            {loading && <span style={{ color: GRAY, fontSize: 8 }}>…</span>}
            <div style={{ flex: 1 }} />
            <button
              onClick={handleAssess}
              disabled={assessing}
              style={{
                background:   "rgba(41,231,255,0.08)",
                border:       `1px solid ${CY}44`,
                borderRadius: 4,
                padding:      "2px 7px",
                color:        CY,
                fontSize:     8,
                cursor:       assessing ? "default" : "pointer",
                fontFamily:   "inherit",
                letterSpacing: 1,
              }}
            >
              {assessing ? "…" : "▶ ASSESS"}
            </button>
            <button
              onClick={() => setVisible(false)}
              style={{
                background:   "transparent",
                border:       "none",
                color:        GRAY,
                fontSize:     11,
                cursor:       "pointer",
                fontFamily:   "inherit",
                padding:      "0 3px",
              }}
            >
              ✕
            </button>
          </div>

          {/* assessment */}
          {assessment && (
            <div
              style={{
                padding:      "6px 12px",
                fontSize:     9,
                color:        CY,
                background:   `${CY}08`,
                borderBottom: `1px solid ${CY}22`,
                flexShrink:   0,
              }}
            >
              {assessment}
            </div>
          )}

          {/* stat tiles */}
          <div style={{ display: "flex", gap: 6, padding: "8px 12px 6px", flexShrink: 0 }}>
            <StatTile label="TOTAL"        value={total}        color={CY}    />
            <StatTile label="KINDS"        value={kindsDisplay} color={PURP}  />
            <StatTile label="RUN OK"       value={lastRunOk}    color={GREEN} />
            <StatTile label="RUN FAIL"     value={lastRunFail}  color={lastRunFail > 0 ? RED : GRAY} />
          </div>

          {/* tabs */}
          <div
            style={{
              display:      "flex",
              gap:          4,
              padding:      "4px 12px",
              flexShrink:   0,
              overflowX:    "auto",
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background:   tab === t ? `${CY}22` : "transparent",
                  border:       `1px solid ${tab === t ? CY : CY + "33"}`,
                  borderRadius: 4,
                  padding:      "2px 8px",
                  color:        tab === t ? CY : GRAY,
                  fontSize:     8,
                  cursor:       "pointer",
                  fontFamily:   "inherit",
                  whiteSpace:   "nowrap",
                  letterSpacing: 1,
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* search */}
          <div style={{ padding: "5px 12px", flexShrink: 0 }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search connectors…"
              style={{
                width:        "100%",
                background:   "rgba(41,231,255,0.05)",
                border:       `1px solid ${CY}22`,
                borderRadius: 5,
                padding:      "3px 8px",
                color:        CY,
                fontSize:     9,
                fontFamily:   "inherit",
                outline:      "none",
                boxSizing:    "border-box",
              }}
            />
          </div>

          {/* list */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 && (
              <div style={{ padding: 16, color: GRAY, fontSize: 9, textAlign: "center" }}>
                {loading ? "Loading connectors…" : search || tab !== "ALL" ? "No matching connectors." : "No connectors registered."}
              </div>
            )}
            {filtered.map((c) => (
              <ConnectorRow key={c.id || c.name} connector={c} />
            ))}
          </div>

          {/* footer */}
          <div
            style={{
              padding:    "5px 12px",
              fontSize:   8,
              color:      GRAY,
              borderTop:  `1px solid ${CY}22`,
              flexShrink: 0,
            }}
          >
            {filtered.length} of {total} connector{total !== 1 ? "s" : ""} · auto-refresh 60 s
          </div>
        </div>
      )}
    </>
  );
}
