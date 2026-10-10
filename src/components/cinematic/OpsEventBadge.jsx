/**
 * OpsEventBadge — F31.
 * Fixed top-right badge showing live ops event count + critical risk count.
 * Sources:
 *   GET /v1/ops/events          → total ops event count
 *   GET /entities/RiskSignal    → critical+high signal count
 * Both are confirmed-real endpoints. Updates every 60 s.
 * Pulses red when critical risks > 0.
 * Click dispatches jarvis:ask "ops status" for a spoken brief.
 * Additive only — mounted via App.jsx.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const CY  = "#29E7FF";
const RED = "#FF3B3B";
const YLW = "#FFD700";
const POLL_MS = 60_000;
const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

async function fetchOpsCount() {
  try {
    const r = await fetch(`${apiBase()}/v1/ops/events`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    const arr = Array.isArray(d) ? d
      : Array.isArray(d?.events) ? d.events
      : Array.isArray(d?.data)   ? d.data
      : Array.isArray(d?.items)  ? d.items
      : [];
    return arr.length;
  } catch {
    return 0;
  }
}

async function fetchCriticalRisks() {
  try {
    const r = await fetch(`${apiBase()}/entities/RiskSignal`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
    });
    if (!r.ok) return 0;
    const d = await r.json();
    const arr = Array.isArray(d) ? d
      : Array.isArray(d?.data)    ? d.data
      : Array.isArray(d?.items)   ? d.items
      : Array.isArray(d?.results) ? d.results
      : [];
    return arr.filter((s) => {
      const sev = (s.severity || s.level || "").toLowerCase();
      return sev === "critical" || sev === "high";
    }).length;
  } catch {
    return 0;
  }
}

export default function OpsEventBadge() {
  const [ops, setOps]           = useState(null);
  const [critical, setCritical] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    const [opsCount, critCount] = await Promise.all([
      fetchOpsCount(),
      fetchCriticalRisks(),
    ]);
    setOps(opsCount);
    setCritical(critCount);
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);
    return () => clearInterval(timerRef.current);
  }, [refresh]);

  function speak() {
    window.dispatchEvent(
      new CustomEvent("jarvis:ask", {
        detail: { text: "ops status — brief me on current ops events and critical risks" },
      })
    );
  }

  if (ops === null && critical === null) return null;

  const hasCritical = (critical || 0) > 0;
  const accent = hasCritical ? RED : (ops || 0) > 0 ? YLW : CY;

  return (
    <>
      <button
        onClick={speak}
        title={`${ops ?? 0} ops events · ${critical ?? 0} critical/high risks — click for spoken brief`}
        style={{
          position: "fixed",
          top: 36,
          right: 18,
          zIndex: 19001,
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "3px 10px",
          background: `${accent}12`,
          border: `1px solid ${accent}55`,
          borderRadius: 999,
          cursor: "pointer",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: 1,
          color: accent,
          backdropFilter: "blur(4px)",
          animation: hasCritical ? "obPulse 1.4s ease-in-out infinite" : "none",
        }}
      >
        <span style={{ fontSize: 10, opacity: 0.7 }}>OPS</span>
        <span style={{ fontWeight: 700 }}>{ops ?? "—"}</span>
        {hasCritical && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ fontSize: 10, opacity: 0.7 }}>CRIT</span>
            <span style={{ fontWeight: 700 }}>{critical}</span>
          </>
        )}
      </button>
      <style>{`
        @keyframes obPulse {
          0%, 100% { box-shadow: 0 0 0 0 ${RED}44; }
          50%       { box-shadow: 0 0 0 6px ${RED}00; }
        }
      `}</style>
    </>
  );
}
