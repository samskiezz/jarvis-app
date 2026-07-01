/**
 * F84 — Active Scenario Status Bar
 * Persistent slim HUD strip (top-right, below LiveTelemetryTicker) that polls
 * /v1/scenario/list every 60 s and shows RUNNING / PENDING / FAILED / COMPLETED
 * count pills. Hides until first successful response. No voice; additive-only.
 * Mounted via App.jsx.
 */
import { useEffect, useState } from "react";
import { apiBase } from "@/api/cinematicDataAdapters";

const API_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_KEY) || "dev-key";

const POLL_MS = 60_000;

const STATUS_COLORS = {
  RUNNING:   { fg: "#29E7FF", bg: "rgba(41,231,255,0.12)",  border: "rgba(41,231,255,0.35)" },
  PENDING:   { fg: "#F0B429", bg: "rgba(240,180,41,0.12)",  border: "rgba(240,180,41,0.35)" },
  FAILED:    { fg: "#FF4444", bg: "rgba(255,68,68,0.12)",   border: "rgba(255,68,68,0.35)"  },
  COMPLETED: { fg: "#22C55E", bg: "rgba(34,197,94,0.12)",   border: "rgba(34,197,94,0.35)"  },
};

const STATUS_ORDER = ["RUNNING", "PENDING", "FAILED", "COMPLETED"];

function countByStatus(list) {
  const counts = { RUNNING: 0, PENDING: 0, FAILED: 0, COMPLETED: 0 };
  for (const item of list) {
    const k = String(item.status || item.state || "").toUpperCase();
    if (k in counts) counts[k]++;
  }
  return counts;
}

function extractList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    return data.scenarios || data.items || data.results || data.data || [];
  }
  return [];
}

export default function ScenarioStatusBar() {
  const [counts, setCounts]  = useState(null);
  const [hasError, setError] = useState(false);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const r = await fetch(`${apiBase()}/v1/scenario/list`, {
          headers: { Authorization: `Bearer ${API_KEY}` },
        });
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        if (alive) {
          setCounts(countByStatus(extractList(data)));
          setError(false);
        }
      } catch {
        if (alive) setError(true);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (!counts && !hasError) return null;

  const activePills = STATUS_ORDER.filter((k) => counts && counts[k] > 0);
  const hasCritical = counts && (counts.RUNNING > 0 || counts.FAILED > 0);

  return (
    <div
      style={{
        position: "fixed",
        top: 26,
        right: 10,
        zIndex: 18990,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px 3px 8px",
        background: "rgba(4,7,12,0.82)",
        border: `1px solid ${hasCritical ? "rgba(41,231,255,0.25)" : "rgba(30,46,58,0.8)"}`,
        borderRadius: 6,
        fontFamily: "'JetBrains Mono',monospace",
        backdropFilter: "blur(8px)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      <span
        style={{
          fontSize: 8,
          letterSpacing: 2,
          color: "rgba(41,231,255,0.45)",
          textTransform: "uppercase",
          marginRight: 2,
        }}
      >
        SIM
      </span>

      {hasError && (
        <span style={{ fontSize: 9, color: "#FF4444", letterSpacing: 1 }}>OFFLINE</span>
      )}

      {!hasError && activePills.length === 0 && (
        <span style={{ fontSize: 9, color: "#2E4050", letterSpacing: 1 }}>IDLE</span>
      )}

      {!hasError &&
        activePills.map((k) => {
          const { fg, bg, border } = STATUS_COLORS[k];
          return (
            <span
              key={k}
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: fg,
                background: bg,
                border: `1px solid ${border}`,
                borderRadius: 3,
                padding: "1px 6px",
              }}
            >
              {counts[k]}&thinsp;{k}
            </span>
          );
        })}
    </div>
  );
}
