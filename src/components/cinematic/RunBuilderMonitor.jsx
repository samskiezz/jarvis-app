/**
 * RunBuilderMonitor — F235.
 *
 * Data sources:
 *   GET /v1/run-builder/runs?limit=50
 *       → {ok, items:[{run_id, ts, name, status, nodes_compiled, error}], count, source}
 *   GET /v1/run-builder/run/{run_id}   (lazy, on row expand)
 *       → {ok, run_id, ts, name, status, nodes_compiled, graph:{nodes,connections}, error}
 *
 * Displays:
 *   - Stat tiles: total / compiled / failed / avg nodes per run
 *   - Filter tabs: ALL | COMPILED | RUNNING | FAILED + text search
 *   - Expand row → graph node list (id, type, position)
 *   - ▶ ASSESS → /v1/jarvis/agent/chat 2-sentence runbook brief + TTS
 *
 * Toggle: ⊞ RBLD at left:101040, bottom:8, zIndex:115.
 * Red badge = any failed, amber = any running, no badge = all compiled/succeeded.
 * 120 s auto-refresh.
 *
 * Exported helpers for JarvisBrain:
 *   isRbldQuery(q) / buildRbldScript()
 *
 * Voice triggers: "run builder / workflow runs / compiled runs / rbld /
 *   graph run / run monitor / workflow builder / build history /
 *   which runs / run status / build runs / run log / workflow log"
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

const BTN_LEFT   = 101040;
const REFRESH_MS = 120_000;
const API_KEY    =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) ||
  "dev-key";

// ─── status helpers ───────────────────────────────────────────────────────────

const STATUS_COLOR = {
  compiled:  CY,
  succeeded: GREEN,
  running:   AMBER,
  failed:    RED,
  cancelled: GRAY,
  unknown:   GRAY,
};

function statusColor(s) {
  return STATUS_COLOR[s] ?? GRAY;
}

function relAge(epochSec) {
  if (!epochSec) return "–";
  const s = Math.floor(Date.now() / 1000 - epochSec);
  if (s < 0) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function fetchRuns() {
  const r = await fetch(
    `${apiBase()}/v1/run-builder/runs?limit=50`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`runs ${r.status}`);
  return r.json();
}

async function fetchRun(runId) {
  const r = await fetch(
    `${apiBase()}/v1/run-builder/run/${encodeURIComponent(runId)}`,
    { headers: { Authorization: `Bearer ${API_KEY}` } },
  );
  if (!r.ok) throw new Error(`run ${r.status}`);
  return r.json();
}

// ─── JarvisBrain exports ──────────────────────────────────────────────────────

const RBLD_RE =
  /\b(run.?builder|workflow.?run|compiled.?run|rbld|graph.?run|run.?monitor|workflow.?builder|build.?histor|which.?run|run.?status|build.?run|run.?log|workflow.?log|compiled.?workflow|node.?run|built.?run)\b/i;

export function isRbldQuery(q) {
  return RBLD_RE.test(q || "");
}

export async function buildRbldScript() {
  try {
    const d = await fetchRuns();
    window.dispatchEvent(new CustomEvent("jarvis:rbld-toggle"));
    const items = d?.items ?? [];
    const total    = items.length;
    const failed   = items.filter((r) => r.status === "failed").length;
    const running  = items.filter((r) => r.status === "running").length;
    const compiled = items.filter((r) => ["compiled", "succeeded"].includes(r.status)).length;
    const avgNodes = total
      ? (items.reduce((s, r) => s + (r.nodes_compiled || 0), 0) / total).toFixed(1)
      : "0";
    if (failed > 0) {
      return (
        `Run Builder Monitor — WARNING sir. ${failed} of ${total} workflow runs have FAILED. ` +
        `${compiled} runs compiled successfully; average graph size is ${avgNodes} nodes. ` +
        `Recommend reviewing the failed run logs and resubmitting corrected graph JSON.`
      );
    }
    if (running > 0) {
      return (
        `Run Builder Monitor — ${running} workflow run${running > 1 ? "s" : ""} currently RUNNING, sir. ` +
        `${compiled} runs compiled and ready; average graph size ${avgNodes} nodes. All looking nominal.`
      );
    }
    return (
      `Run Builder Monitor online, sir. ${total} workflow run${total !== 1 ? "s" : ""} on record; ` +
      `all compiled successfully. Average graph size is ${avgNodes} nodes per run. No failures detected.`
    );
  } catch {
    window.dispatchEvent(new CustomEvent("jarvis:rbld-toggle"));
    return "Run Builder Monitor open, sir.";
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

function NodeRow({ node }) {
  const [x, y] = node.position ?? [0, 0];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "4px 10px",
        borderBottom: `1px solid ${CY}18`,
        fontSize: 9,
      }}
    >
      <span style={{ color: PURP, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis" }}>
        {node.id || node.name || "–"}
      </span>
      <span style={{ color: GRAY, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {node.type || "–"}
      </span>
      <span style={{ color: GRAY, whiteSpace: "nowrap" }}>
        [{x},{y}]
      </span>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RunBuilderMonitor() {
  const [visible,    setVisible]    = useState(false);
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [tab,        setTab]        = useState("ALL");
  const [search,     setSearch]     = useState("");
  const [expanded,   setExpanded]   = useState(null);   // run_id
  const [detail,     setDetail]     = useState({});      // run_id → detail obj
  const [detailLoading, setDetailLoading] = useState(false);
  const [assessing,  setAssessing]  = useState(false);
  const [assessment, setAssessment] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    const onToggle = () => setVisible((v) => !v);
    window.addEventListener("jarvis:rbld-toggle", onToggle);
    return () => window.removeEventListener("jarvis:rbld-toggle", onToggle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await fetchRuns();
      setData(d);
    } catch {
      // retain stale data on error
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

  const items = data?.items ?? [];
  const total    = items.length;
  const failed   = items.filter((r) => r.status === "failed").length;
  const running  = items.filter((r) => r.status === "running").length;
  const compiled = items.filter((r) => ["compiled", "succeeded"].includes(r.status)).length;
  const avgNodes = total
    ? Math.round(items.reduce((s, r) => s + (r.nodes_compiled || 0), 0) / total)
    : 0;

  const badgeColor = failed > 0 ? RED : running > 0 ? AMBER : null;
  const badgeVal   = failed > 0 ? `${failed} FAIL` : running > 0 ? `${running} RUN` : null;

  const filtered = items.filter((r) => {
    if (tab === "COMPILED" && !["compiled", "succeeded"].includes(r.status)) return false;
    if (tab === "RUNNING"  && r.status !== "running")  return false;
    if (tab === "FAILED"   && r.status !== "failed")   return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (r.run_id || "").toLowerCase().includes(q) ||
        (r.name   || "").toLowerCase().includes(q) ||
        (r.status || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function toggleExpand(runId) {
    if (expanded === runId) {
      setExpanded(null);
      return;
    }
    setExpanded(runId);
    if (detail[runId]) return;
    setDetailLoading(true);
    try {
      const d = await fetchRun(runId);
      setDetail((prev) => ({ ...prev, [runId]: d }));
    } catch {
      setDetail((prev) => ({ ...prev, [runId]: { error: "load failed" } }));
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleAssess() {
    setAssessing(true);
    try {
      const context = `total_runs=${total}, compiled=${compiled}, failed=${failed}, running=${running}, avg_nodes=${avgNodes}`;
      const r = await fetch(`${apiBase()}/v1/jarvis/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          message: `Interpret this Run Builder snapshot in 2 sentences: ${context}. Focus on workflow health and any recommended operational action.`,
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

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setVisible((v) => !v)}
        style={{
          position: "fixed",
          bottom: 8,
          left: `min(${BTN_LEFT}px, calc(100vw - 115px))`,
          zIndex: 115,
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
        ⊞ RBLD
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
            left: `min(${BTN_LEFT - 370}px, calc(100vw - 500px))`,
            width: 470,
            maxHeight: "76vh",
            overflowY: "auto",
            zIndex: 116,
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
              ⊞ RUN BUILDER MONITOR
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {loading && <span style={{ color: GRAY, fontSize: 9 }}>◌</span>}
              <button
                onClick={handleAssess}
                disabled={assessing || !data}
                style={{
                  background: assessing ? "#1A2030" : `${CY}18`,
                  border: `1px solid ${CY}44`,
                  borderRadius: 5,
                  padding: "2px 8px",
                  color: assessing ? GRAY : CY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: assessing || !data ? "default" : "pointer",
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
          {data && (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px" }}>
              <StatTile label="TOTAL RUNS" value={total} color={CY} />
              <StatTile label="COMPILED"   value={compiled} color={GREEN} />
              <StatTile label="FAILED"     value={failed}   color={failed > 0 ? RED : GRAY} />
              <StatTile label="AVG NODES"  value={avgNodes} color={PURP} />
            </div>
          )}

          {/* Filter tabs */}
          <div
            style={{
              display: "flex",
              gap: 6,
              padding: "0 12px 8px",
              borderBottom: `1px solid ${CY}22`,
            }}
          >
            {["ALL", "COMPILED", "RUNNING", "FAILED"].map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  background: tab === t ? `${CY}22` : "transparent",
                  border: `1px solid ${tab === t ? CY + "88" : CY + "22"}`,
                  borderRadius: 4,
                  padding: "2px 7px",
                  color: tab === t ? CY : GRAY,
                  fontSize: 9,
                  letterSpacing: 1,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t}
              </button>
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
                width: 100,
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

          {/* Run list */}
          {!data && loading && (
            <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
              ◌ LOADING…
            </div>
          )}
          {data && filtered.length === 0 && (
            <div style={{ color: GRAY, fontSize: 9, padding: 16, textAlign: "center" }}>
              No runs match the current filter.
            </div>
          )}
          {filtered.map((run) => {
            const sc = statusColor(run.status);
            const isOpen = expanded === run.run_id;
            const det = detail[run.run_id];
            const nodes = det?.graph?.nodes ?? [];
            return (
              <div key={run.run_id} style={{ borderBottom: `1px solid ${CY}18` }}>
                {/* Row */}
                <div
                  onClick={() => toggleExpand(run.run_id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 12px",
                    cursor: "pointer",
                    background: isOpen ? `${CY}08` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ color: sc, fontSize: 9, minWidth: 70 }}>
                    {(run.status || "–").toUpperCase()}
                  </span>
                  <span
                    style={{
                      color: CY,
                      fontSize: 9,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {run.name || run.run_id.slice(0, 12)}
                  </span>
                  <span style={{ color: GRAY, fontSize: 8, whiteSpace: "nowrap" }}>
                    {run.nodes_compiled ?? 0} nodes
                  </span>
                  <span style={{ color: GRAY, fontSize: 8, whiteSpace: "nowrap" }}>
                    {relAge(run.ts)}
                  </span>
                  <span style={{ color: GRAY, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                </div>

                {/* Expand: graph detail */}
                {isOpen && (
                  <div
                    style={{
                      padding: "0 0 8px",
                      background: "rgba(41,231,255,0.03)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 6,
                        padding: "4px 12px",
                        fontSize: 8,
                        color: GRAY,
                      }}
                    >
                      <span>RUN: {run.run_id}</span>
                      {run.error && (
                        <span style={{ color: RED, marginLeft: "auto" }}>
                          ✕ {run.error.slice(0, 60)}
                        </span>
                      )}
                    </div>
                    {!det && detailLoading && (
                      <div style={{ color: GRAY, fontSize: 8, padding: "4px 12px" }}>
                        ◌ loading graph…
                      </div>
                    )}
                    {det && nodes.length > 0 && (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            padding: "3px 10px",
                            fontSize: 8,
                            color: GRAY,
                            borderBottom: `1px solid ${CY}18`,
                            letterSpacing: 1,
                          }}
                        >
                          <span style={{ minWidth: 80 }}>NODE ID</span>
                          <span style={{ flex: 1 }}>TYPE</span>
                          <span>POS</span>
                        </div>
                        {nodes.slice(0, 12).map((n, i) => (
                          <NodeRow key={n.id || i} node={n} />
                        ))}
                        {nodes.length > 12 && (
                          <div
                            style={{ color: GRAY, fontSize: 8, padding: "3px 10px" }}
                          >
                            …and {nodes.length - 12} more nodes
                          </div>
                        )}
                      </div>
                    )}
                    {det && nodes.length === 0 && !det.error && (
                      <div style={{ color: GRAY, fontSize: 8, padding: "4px 12px" }}>
                        No graph nodes available.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Source tag */}
          {data && (
            <div
              style={{
                textAlign: "right",
                padding: "4px 12px",
                color: GRAY,
                fontSize: 8,
                borderTop: `1px solid ${CY}18`,
              }}
            >
              {data.source ?? "live"} · {total} runs
            </div>
          )}
        </div>
      )}
    </>
  );
}
