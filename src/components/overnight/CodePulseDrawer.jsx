/**
 * CodePulseDrawer — F65
 * Right-edge slide-in drawer at 17 % vertical.
 * Polls GET /v1/codepulse/status (30 s) and GET /v1/codepulse/pending (30 s).
 * Shows VS Code bridge connection state + pending change-proposal queue.
 */
import { useEffect, useRef, useState } from "react";

const ACC = "#38BDF8"; // sky-blue accent
const BG  = "rgba(5,12,20,0.97)";
const BORDER = `1px solid ${ACC}33`;
const MONO = "'JetBrains Mono','Courier New',monospace";
const POLL_MS = 30_000;

function ago(ts) {
  if (!ts) return "—";
  const d = Date.now() / 1000 - ts;
  if (d < 60)  return `${Math.round(d)}s ago`;
  if (d < 3600) return `${Math.round(d / 60)}m ago`;
  return `${Math.round(d / 3600)}h ago`;
}

export default function CodePulseDrawer() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(null);
  const [pending, setPending] = useState([]);
  const [err, setErr] = useState(null);
  const timerRef = useRef(null);

  async function fetchAll() {
    try {
      const [sRes, pRes] = await Promise.all([
        fetch("/v1/codepulse/status"),
        fetch("/v1/codepulse/pending"),
      ]);
      if (!sRes.ok || !pRes.ok) throw new Error("fetch failed");
      const [sData, pData] = await Promise.all([sRes.json(), pRes.json()]);
      setStatus(sData);
      setPending(Array.isArray(pData.items) ? pData.items : []);
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

  const connected = status?.connected || status?.status === "connected";
  const workspace = status?.workspace || status?.workspace_root || null;
  const model = status?.model || status?.config?.model || null;
  const pendingCount = pending.length;

  return (
    <>
      {/* Tab button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed", right: open ? 300 : 0, top: "17%",
          zIndex: 1200, writingMode: "vertical-rl", textOrientation: "mixed",
          background: open ? ACC + "22" : BG,
          border: BORDER, borderRight: "none",
          borderRadius: "6px 0 0 6px",
          color: ACC, fontFamily: MONO, fontSize: 9, letterSpacing: 2,
          padding: "10px 5px", cursor: "pointer",
          transition: "right 0.22s ease",
        }}
        title="CodePulse VS Code Bridge (F65)"
      >
        CODE ◀
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
            ⚡ CODE PULSE
          </span>
          <span style={{
            background: connected ? "#16A34A22" : "#DC262622",
            color: connected ? "#4ADE80" : "#F87171",
            border: `1px solid ${connected ? "#4ADE8044" : "#F8717144"}`,
            fontSize: 9, letterSpacing: 1.5, padding: "2px 6px", borderRadius: 4,
          }}>
            {connected ? "● CONNECTED" : "○ IDLE"}
          </span>
        </div>

        {/* Workspace info */}
        {workspace && (
          <div style={{
            padding: "6px 14px",
            borderBottom: `1px solid ${ACC}11`,
            fontSize: 9, color: "#7A9AB5", letterSpacing: 0.5,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {workspace.replace(/^.*[/\\]/, "")}
            {model && (
              <span style={{ marginLeft: 8, color: ACC, opacity: 0.7 }}>· {model}</span>
            )}
          </div>
        )}

        {/* Error */}
        {err && (
          <div style={{ padding: "8px 14px", color: "#F87171", fontSize: 9 }}>
            ⚠ {err}
          </div>
        )}

        {/* Pending proposals */}
        <div style={{
          padding: "7px 14px 4px",
          fontSize: 9, letterSpacing: 2, color: "#3A5060",
          borderBottom: pendingCount ? `1px solid ${ACC}11` : "none",
        }}>
          PENDING PROPOSALS{pendingCount > 0 ? ` (${pendingCount})` : ""}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {!open ? null : pendingCount === 0 ? (
            <div style={{ padding: "16px 14px", color: "#3A5060", fontSize: 9 }}>
              NO PENDING PROPOSALS
            </div>
          ) : (
            pending.map((item) => {
              const statusColor =
                item.status === "approved" ? "#4ADE80" :
                item.status === "rejected" ? "#F87171" :
                item.status === "pending"  ? "#FCD34D" : ACC;
              return (
                <div key={item.id} style={{
                  padding: "7px 14px",
                  borderBottom: `1px solid ${ACC}0A`,
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                  <div style={{
                    fontSize: 10, color: "#C0DCE8",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.file || item.path || item.description || item.id}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{
                      fontSize: 8, letterSpacing: 1.2,
                      color: statusColor,
                      border: `1px solid ${statusColor}44`,
                      padding: "1px 5px", borderRadius: 3,
                    }}>
                      {(item.status || "pending").toUpperCase()}
                    </span>
                    {item.lines_changed != null && (
                      <span style={{ fontSize: 8, color: "#3A5060" }}>
                        Δ{item.lines_changed}
                      </span>
                    )}
                    <span style={{ fontSize: 8, color: "#3A5060", marginLeft: "auto" }}>
                      {ago(item.created_at || item.ts)}
                    </span>
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
          /v1/codepulse · 30 s poll
        </div>
      </div>
    </>
  );
}
