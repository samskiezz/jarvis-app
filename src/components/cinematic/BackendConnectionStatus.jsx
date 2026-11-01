/**
 * BackendConnectionStatus — persistent top-right indicator showing whether
 * the JARVIS backend is reachable. When offline, an expandable banner
 * explains why every panel is empty.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const POLL_MS = 30_000;
const TIMEOUT_MS = 5_000;

const GREEN  = "#22c55e";
const RED    = "#FF3B6B";
const AMBER  = "#FFB830";
const CYAN   = "#29E7FF";
const BG     = "rgba(5,8,13,0.85)";

const STATUS = { CONNECTING: "connecting", ONLINE: "online", OFFLINE: "offline" };

export default function BackendConnectionStatus() {
  const [status, setStatus]       = useState(STATUS.CONNECTING);
  const [dismissed, setDismissed] = useState(false);
  const [base, setBase]           = useState("");
  const mountedRef                = useRef(true);

  const check = useCallback(async () => {
    const url = apiBase();
    setBase(url);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(`${url}/health`, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (mountedRef.current) setStatus(r.ok ? STATUS.ONLINE : STATUS.OFFLINE);
    } catch {
      if (mountedRef.current) setStatus(STATUS.OFFLINE);
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    check();
    const id = setInterval(check, POLL_MS);
    return () => { mountedRef.current = false; clearInterval(id); };
  }, [check]);

  const color = status === STATUS.ONLINE ? GREEN
              : status === STATUS.OFFLINE ? RED
              : AMBER;

  const label = status === STATUS.ONLINE  ? "BACKEND ONLINE"
              : status === STATUS.OFFLINE ? "BACKEND OFFLINE"
              : "CONNECTING…";

  const showBanner = status === STATUS.OFFLINE && !dismissed;

  return (
    <>
      {/* Dot + label */}
      <div
        onClick={() => { if (status === STATUS.OFFLINE) setDismissed(d => !d); }}
        style={{
          position: "fixed", top: 12, right: 14, zIndex: 9999,
          display: "flex", alignItems: "center", gap: 7,
          background: BG,
          border: `1px solid ${color}44`,
          borderRadius: 8,
          padding: "5px 12px 5px 10px",
          cursor: status === STATUS.OFFLINE ? "pointer" : "default",
          backdropFilter: "blur(8px)",
          fontFamily: "'JetBrains Mono', monospace",
          transition: "all 0.3s",
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: "50%",
          background: color,
          boxShadow: `0 0 6px ${color}`,
          animation: status === STATUS.CONNECTING ? "bcs-pulse 1.2s ease-in-out infinite" : "none",
        }} />
        <span style={{
          fontSize: 9, letterSpacing: 1.8, fontWeight: 700,
          color: status === STATUS.ONLINE ? GREEN : status === STATUS.OFFLINE ? RED : AMBER,
        }}>
          {label}
        </span>
        {status === STATUS.OFFLINE && (
          <span style={{ fontSize: 9, color: "#666", marginLeft: 2 }}>
            {dismissed ? "▸" : "▾"}
          </span>
        )}
      </div>

      {/* Offline banner */}
      {showBanner && (
        <div style={{
          position: "fixed", top: 48, right: 14, zIndex: 9998,
          width: "min(380px, 90vw)",
          background: "rgba(10,4,4,0.92)",
          border: `1px solid ${RED}44`,
          borderRadius: 10,
          padding: "14px 16px",
          backdropFilter: "blur(10px)",
          fontFamily: "'JetBrains Mono', monospace",
          boxShadow: `0 4px 24px ${RED}22`,
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 8,
          }}>
            <span style={{ color: RED, fontSize: 10, fontWeight: 700, letterSpacing: 1.5 }}>
              ⚠ NO BACKEND CONNECTION
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
              style={{
                background: "none", border: "none", color: "#555",
                cursor: "pointer", fontSize: 14, padding: "0 2px",
              }}
            >
              ✕
            </button>
          </div>
          <p style={{ color: "#888", fontSize: 10, lineHeight: 1.6, margin: 0 }}>
            Backend not reachable at{" "}
            <span style={{ color: CYAN }}>{base || "unknown"}</span>.
            All panels will show empty until the server is running.
          </p>
          <p style={{
            color: "#555", fontSize: 9, lineHeight: 1.5, margin: "8px 0 0",
          }}>
            Start the backend: <span style={{ color: "#aaa" }}>uvicorn server.main:app --port 8001</span>
            <br />
            Or see <span style={{ color: CYAN }}>CLAUDE.md</span> for full setup.
          </p>
        </div>
      )}

      <style>{`@keyframes bcs-pulse { 0%,100%{opacity:1}50%{opacity:0.3} }`}</style>
    </>
  );
}
