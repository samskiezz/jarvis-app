/**
 * ClaudeCodeRunsDrawer — F69
 * Right-edge slide-in drawer at 77 % vertical.
 * Polls GET /v1/claude_code/runs?limit=20&archived=1 and GET /v1/claude_code/stats every 30 s.
 * Shows JARVIS's own Claude Code (whip) session history: status, outcome, elapsed time.
 */
import { useEffect, useRef, useState } from "react";

const ACC   = "#4ADE80"; // green-400
const BG    = "rgba(5,12,20,0.97)";
const BORDER = `1px solid ${ACC}33`;
const MONO  = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 30_000;
const LIMIT = 20;

function fmtElapsed(s) {
  if (s == null || s === 0) return "—";
  if (s < 60)   return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
}

function ago(ts) {
  if (!ts) return "—";
  const d = Date.now() / 1000 - ts;
  if (d < 60)   return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

function statusColor(status, archived) {
  if (archived)                   return "#6B7280";
  if (status === "active")        return "#4ADE80";
  if (status === "idle")          return "#FCD34D";
  return "#94A3B8";
}

function outcomeColor(outcome) {
  if (!outcome)                   return "#6B7280";
  if (outcome === "success")      return "#4ADE80";
  if (outcome === "manual_archive") return "#94A3B8";
  if (outcome === "error" || outcome === "timeout") return "#F87171";
  return "#94A3B8";
}

export default function ClaudeCodeRunsDrawer() {
  const [open, setOpen]   = useState(false);
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [err, setErr]     = useState(null);
  const timerRef = useRef(null);

  async function fetchAll() {
    try {
      const [rRes, sRes] = await Promise.all([
        fetch(`/v1/claude_code/runs?limit=${LIMIT}&archived=1`),
        fetch("/v1/claude_code/stats"),
      ]);
      if (!rRes.ok) throw new Error(`runs ${rRes.status}`);
      if (!sRes.ok) throw new Error(`stats ${sRes.status}`);
      const [rData, sData] = await Promise.all([rRes.json(), sRes.json()]);
      setItems(Array.isArray(rData.items) ? rData.items : []);
      setStats(sData);
      setErr(null);
    } catch (e) {
      setErr(e.message || "fetch error");
    }
  }

  useEffect(() => {
    if (!open) return;
    fetchAll();
    timerRef.current = setInterval(fetchAll, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [open]);

  const openCount = stats?.open ?? items.filter(i => i.status === "active" && !i.archived).length;

  return (
    <>
      {/* Tab button */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          position: "fixed", right: open ? 300 : 0, top: "77%",
          zIndex: 1200, writingMode: "vertical-rl", textOrientation: "mixed",
          background: open ? ACC + "22" : BG,
          border: BORDER, borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: ACC, fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "10px 5px", cursor: "pointer",
          transition: "right 0.22s ease",
        }}
        title="Claude Code Runs (F69)"
      >
        RUNS ◀
      </button>

      {/* Drawer panel */}
      <div style={{
        position: "fixed", top: 0, right: open ? 0 : -300,
        width: 300, height: "100vh", zIndex: 1199,
        background: BG, backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        borderLeft: `1px solid ${ACC}33`,
        display: "flex", flexDirection: "column",
        transition: "right 0.22s ease",
        fontFamily: MONO,
      }}>
        {/* Header */}
        <div style={{
          padding: "10px 14px 8px",
          borderBottom: `1px solid ${ACC}22`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ color: ACC, fontSize: 10, letterSpacing: 2.5 }}>
            ⚙ CLAUDE CODE RUNS
          </span>
          {openCount > 0 && (
            <span style={{
              background: "#16A34A22", color: "#4ADE80",
              border: "1px solid #4ADE8044",
              fontSize: 9, letterSpacing: 1.5, padding: "2px 6px", borderRadius: 4,
            }}>
              {openCount} ACTIVE
            </span>
          )}
        </div>

        {/* Stats tiles */}
        {stats && (
          <div style={{
            display: "flex", gap: 6, padding: "8px 14px",
            borderBottom: `1px solid ${ACC}11`,
          }}>
            {[
              { label: "TOTAL", value: stats.total ?? "—" },
              { label: "OPEN",  value: stats.open ?? "—" },
              { label: "AVG",   value: fmtElapsed(stats.avg_elapsed_s) },
            ].map(({ label, value }) => (
              <div key={label} style={{
                flex: 1, background: `${ACC}09`,
                border: `1px solid ${ACC}22`, borderRadius: 5,
                padding: "5px 0", textAlign: "center",
              }}>
                <div style={{ fontSize: 14, color: ACC, fontWeight: 600 }}>{value}</div>
                <div style={{ fontSize: 7, color: "#3A5060", letterSpacing: 1.5, marginTop: 1 }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 14px", color: "#F87171", fontSize: 9 }}>
            ⚠ {err}
          </div>
        )}

        {/* Runs list */}
        <div style={{
          padding: "7px 14px 4px",
          fontSize: 9, letterSpacing: 2, color: "#3A5060",
          borderBottom: items.length ? `1px solid ${ACC}11` : "none",
        }}>
          RECENT RUNS {items.length > 0 ? `(${items.length})` : ""}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {!open ? null : items.length === 0 ? (
            <div style={{ padding: "16px 14px", color: "#3A5060", fontSize: 9 }}>
              NO RUNS RECORDED
            </div>
          ) : (
            items.map(item => {
              const isActive  = item.status === "active" && !item.archived;
              const sc        = statusColor(item.status, item.archived);
              const oc        = outcomeColor(item.outcome);
              const shortId   = (item.run_id || "").slice(0, 8);
              const hb        = item.heartbeat || item.last_heartbeat || item.updated_at;
              return (
                <div key={item.run_id || item.id} style={{
                  padding: "7px 14px",
                  borderBottom: `1px solid ${ACC}0A`,
                  display: "flex", flexDirection: "column", gap: 4,
                }}>
                  {/* Row 1: ID + status + outcome */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: MONO, fontSize: 8, color: "#7A9AB5",
                      background: "#0D1B2A", border: "1px solid #1E3040",
                      padding: "1px 5px", borderRadius: 3,
                    }}>
                      {shortId || "—"}
                    </span>
                    <span style={{
                      fontSize: 8, letterSpacing: 1, color: sc,
                      border: `1px solid ${sc}44`, padding: "1px 5px", borderRadius: 3,
                    }}>
                      {isActive ? "● ACTIVE" : item.archived ? "ARCHIVED" : (item.status || "—").toUpperCase()}
                    </span>
                    {item.outcome && (
                      <span style={{
                        fontSize: 8, letterSpacing: 1, color: oc,
                        border: `1px solid ${oc}44`, padding: "1px 5px", borderRadius: 3,
                      }}>
                        {item.outcome.replace(/_/g, " ").toUpperCase()}
                      </span>
                    )}
                    {item.detached && (
                      <span style={{
                        fontSize: 7, color: "#FCD34D",
                        border: "1px solid #FCD34D33", padding: "1px 4px", borderRadius: 3,
                      }}>
                        DETACHED
                      </span>
                    )}
                  </div>
                  {/* Row 2: elapsed + heartbeat */}
                  <div style={{ display: "flex", gap: 8, fontSize: 8, color: "#3A5060" }}>
                    {item.elapsed != null && (
                      <span>⏱ {fmtElapsed(item.elapsed)}</span>
                    )}
                    {hb && (
                      <span style={{ marginLeft: "auto" }}>♥ {ago(hb)}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "6px 14px", borderTop: `1px solid ${ACC}11`,
          fontSize: 8, color: "#3A5060", letterSpacing: 1,
        }}>
          /v1/claude_code · 30 s poll
        </div>
      </div>
    </>
  );
}
